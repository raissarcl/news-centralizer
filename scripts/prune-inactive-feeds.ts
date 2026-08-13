/**
 * Fetch every catalog feed and remove those with fewer than N items
 * published in the last D days from project JSON catalogs.
 *
 *   npx tsx scripts/prune-inactive-feeds.ts           # dry-run
 *   npx tsx scripts/prune-inactive-feeds.ts --apply   # write changes
 *
 * Options:
 *   --min=5     minimum recent items (default 5)
 *   --days=30   lookback window in days (default 30)
 */
import fs from 'node:fs';
import path from 'node:path';
import { isAfter, parseISO, subDays } from 'date-fns';
import type { FeedCatalog } from '../src/data/feeds/types';
import { decodeFeedBody } from '../src/lib/rss/decodeFeedBody';
import { parseFeedXml } from '../src/lib/rss/parseFeedXml';
import { flattenCatalogFeeds, pruneCatalogUrls } from './catalogJson';

const ROOT = path.resolve(__dirname, '..');
const FEEDS_DIR = path.join(ROOT, 'src', 'data', 'feeds');

const APPLY = process.argv.includes('--apply');
const MIN_RECENT = Number(
  process.argv.find((a) => a.startsWith('--min='))?.slice('--min='.length) ?? 5,
);
const LOOKBACK_DAYS = Number(
  process.argv.find((a) => a.startsWith('--days='))?.slice('--days='.length) ??
    30,
);

type CatalogFile = {
  file: string;
  optional?: boolean;
};

const CATALOGS: CatalogFile[] = [
  { file: 'computing.json' },
  { file: 'general.json' },
  { file: 'computing.local.json', optional: true },
  { file: 'general.local.json', optional: true },
  { file: 'engblogs-legacy.json', optional: true },
];

type Probe = {
  url: string;
  title: string;
  recent: number;
  total: number;
  error?: string;
};

async function probeFeed(url: string, title: string): Promise<Probe> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept:
          'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        'User-Agent': 'NewsCentralizer-PruneInactive/1.0',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      return {
        url,
        title,
        recent: 0,
        total: 0,
        error: `HTTP ${res.status}`,
      };
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ctype = res.headers.get('content-type') ?? '';
    const text = decodeFeedBody(bytes, ctype);
    const entries = parseFeedXml(text);
    const cutoff = subDays(new Date(), LOOKBACK_DAYS);
    const recent = entries.filter((e) => {
      try {
        const d = parseISO(e.publishedAt);
        if (Number.isNaN(d.getTime())) return false;
        return isAfter(d, cutoff) || d.getTime() === cutoff.getTime();
      } catch {
        return false;
      }
    }).length;
    return { url, title, recent, total: entries.length };
  } catch (e) {
    return {
      url,
      title,
      recent: 0,
      total: 0,
      error: e instanceof Error ? e.message.slice(0, 100) : 'fetch error',
    };
  }
}

async function main(): Promise<void> {
  if (!Number.isFinite(MIN_RECENT) || MIN_RECENT < 0) {
    console.error('Invalid --min');
    process.exit(1);
  }
  if (!Number.isFinite(LOOKBACK_DAYS) || LOOKBACK_DAYS < 1) {
    console.error('Invalid --days');
    process.exit(1);
  }

  const catalogs = CATALOGS.filter((c) => {
    const p = path.join(FEEDS_DIR, c.file);
    if (fs.existsSync(p)) return true;
    if (c.optional) return false;
    console.error(`Missing catalog: ${p}`);
    process.exit(1);
  });

  const byUrl = new Map<string, { title: string; files: string[] }>();
  for (const catalog of catalogs) {
    const catalogPath = path.join(FEEDS_DIR, catalog.file);
    const parsed = JSON.parse(
      fs.readFileSync(catalogPath, 'utf8'),
    ) as FeedCatalog;
    for (const feed of flattenCatalogFeeds(parsed)) {
      const prev = byUrl.get(feed.url);
      if (prev) {
        prev.files.push(catalog.file);
      } else {
        byUrl.set(feed.url, {
          title: feed.title,
          files: [catalog.file],
        });
      }
    }
  }

  const urls = [...byUrl.keys()];
  const concurrency = 6;
  console.log(
    `Probing ${urls.length} unique feeds (need ≥${MIN_RECENT} items in last ${LOOKBACK_DAYS}d, concurrency=${concurrency})`,
  );
  console.log(APPLY ? 'Mode: APPLY (will rewrite JSON)\n' : 'Mode: dry-run\n');

  const probes: Probe[] = new Array(urls.length);
  let nextIndex = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (nextIndex < urls.length) {
      const index = nextIndex++;
      const url = urls[index];
      const meta = byUrl.get(url)!;
      const probe = await probeFeed(url, meta.title);
      probes[index] = probe;
      done += 1;
      if (probe.error) {
        console.log(
          `[${done}/${urls.length}] FAIL ${meta.title} (${probe.error}) → remove`,
        );
      } else {
        const keep = probe.recent >= MIN_RECENT;
        console.log(
          `[${done}/${urls.length}] ${probe.recent}/${probe.total} recent ${keep ? 'KEEP' : 'REMOVE'} — ${meta.title}`,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()),
  );

  const toRemove = new Set(
    probes.filter((p) => p.recent < MIN_RECENT).map((p) => p.url),
  );
  const kept = probes.length - toRemove.size;

  console.log('\n=== Summary ===');
  console.log(`keep=${kept} remove=${toRemove.size} total=${probes.length}`);
  if (toRemove.size > 0) {
    console.log('\nFeeds to remove:');
    for (const p of probes.filter((x) => toRemove.has(x.url))) {
      const reason = p.error
        ? p.error
        : `${p.recent} items in ${LOOKBACK_DAYS}d (min ${MIN_RECENT})`;
      console.log(`  - ${p.title}: ${p.url}`);
      console.log(`    ${reason}`);
    }
  }

  if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to write changes.');
    return;
  }

  if (toRemove.size === 0) {
    console.log('\nNothing to remove.');
    return;
  }

  for (const catalog of catalogs) {
    const catalogPath = path.join(FEEDS_DIR, catalog.file);
    const before = JSON.parse(
      fs.readFileSync(catalogPath, 'utf8'),
    ) as FeedCatalog;
    const after = pruneCatalogUrls(before, toRemove);
    const beforeCount = flattenCatalogFeeds(before).length;
    const afterCount = flattenCatalogFeeds(after).length;
    if (beforeCount === afterCount) {
      console.log(`unchanged ${catalog.file}`);
      continue;
    }
    fs.writeFileSync(
      catalogPath,
      `${JSON.stringify(after, null, 2)}\n`,
      'utf8',
    );
    console.log(`updated ${catalog.file} (${beforeCount} → ${afterCount})`);
  }

  console.log('\nDone.');
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
