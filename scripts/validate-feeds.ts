import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FeedCatalog } from '../src/data/feeds/types';
import { parseFeedXml } from '../src/lib/rss/parseFeedXml';
import { safeFetch } from '../src/lib/security/safeFetch';
import { flattenCatalogFeeds } from './catalogJson';

const CATALOG_PATH =
  process.argv[2] ?? join(__dirname, '../src/data/feeds/computing.json');

type Result = {
  title: string;
  url: string;
  folder?: string;
  status: number | 'ERR';
  items: number;
  error?: string;
};

async function validateFeed(
  title: string,
  url: string,
  folder?: string,
): Promise<Result> {
  const result = await safeFetch(url, {
    headers: {
      Accept:
        'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      'User-Agent': 'NewsCentralizer-Validator/1.0',
    },
    validateOptions: { allowHttp: true },
  });

  if (!result.ok) {
    return {
      title,
      url,
      folder,
      status: result.status ?? 'ERR',
      items: 0,
      error: result.error,
    };
  }

  const entries = parseFeedXml(result.text);
  return {
    title,
    url,
    folder,
    status: result.status,
    items: entries.length,
    error: entries.length === 0 ? 'Parse OK but 0 items' : undefined,
  };
}

async function main() {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as FeedCatalog;
  const feeds = flattenCatalogFeeds(catalog);
  console.log(`Validating ${feeds.length} feeds from ${CATALOG_PATH}\n`);

  const results: Result[] = [];
  for (const feed of feeds) {
    const result = await validateFeed(feed.title, feed.url, feed.folderName);
    results.push(result);
    const icon = result.error ? 'FAIL' : 'OK';
    console.log(
      `[${icon}] ${result.title} (${result.folder ?? '?'}) — ${result.status}, ${result.items} items${result.error ? ` — ${result.error}` : ''}`,
    );
    await new Promise((r) => setTimeout(r, 300));
  }

  const failed = results.filter((r) => r.error);
  console.log(`\n${results.length - failed.length}/${results.length} OK`);
  if (failed.length > 0) {
    console.log('\nFailed feeds:');
    for (const f of failed) {
      console.log(`  - ${f.title}: ${f.url} (${f.error})`);
    }
    process.exit(1);
  }
}

void main();
