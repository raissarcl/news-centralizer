import fs from 'fs';
import path from 'path';
import { flattenOpmlFeeds, parseOpml } from '../src/lib/opml';
import { parseFeedXml } from '../src/lib/rss/parseFeedXml';

function loadGeneralFeedsOpml(): string {
  const dataDir = path.join(__dirname, '../src/data');
  const local = path.join(dataDir, 'default-general-feeds.local.opml');
  const pub = path.join(dataDir, 'default-general-feeds.opml');
  const file = fs.existsSync(local) ? local : pub;
  return fs.readFileSync(file, 'utf8');
}

type Row = {
  title: string;
  url: string;
  enabled: boolean;
  http: number | 'ERR';
  ctype: string;
  format: string;
  rawHint: number;
  parsed: number;
  note: string;
};

function detectFormat(xml: string): string {
  const t = xml.trim().slice(0, 800).toLowerCase();
  if (t.includes('rdf:rdf') || t.includes('rss/1.0')) return 'rdf/rss1';
  if (t.includes('<rss') && t.includes('0.91')) return 'rss0.91';
  if (t.includes('<rss')) return 'rss2';
  if (t.includes('<feed') || t.includes('atom')) return 'atom';
  if (t.includes('<html') || t.includes('<!doctype html')) return 'html';
  return 'unknown';
}

function countRawItems(xml: string): number {
  return (xml.match(/<item[\s>]/gi) ?? []).length + (xml.match(/<entry[\s>]/gi) ?? []).length;
}

async function probe(title: string, url: string, enabled?: boolean): Promise<Row> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        'User-Agent': 'NewsCentralizerAudit/1.0',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    // Folha often serves ISO-8859-1; try decode as latin1 if utf8 has replacement chars heavily
    let text = buf.toString('utf8');
    const ctype = res.headers.get('content-type') ?? '';
    if (/iso-8859-1|latin-1|windows-1252/i.test(ctype) || text.includes('�')) {
      text = buf.toString('latin1');
    }
    const format = detectFormat(text);
    const rawHint = countRawItems(text);
    const parsed = parseFeedXml(text).length;
    let note = '';
    if (!res.ok) note = `HTTP ${res.status}`;
    else if (format === 'html') note = 'HTML, não é feed';
    else if (rawHint === 0) note = 'XML sem <item>/<entry>';
    else if (parsed === 0) note = 'tem itens, parser zerou (data/formato)';
    else note = 'ok';
    return {
      title,
      url,
      enabled: enabled !== false,
      http: res.status,
      ctype: ctype.slice(0, 40),
      format,
      rawHint,
      parsed,
      note,
    };
  } catch (e) {
    return {
      title,
      url,
      enabled: enabled !== false,
      http: 'ERR',
      ctype: '',
      format: '-',
      rawHint: 0,
      parsed: 0,
      note: e instanceof Error ? e.message.slice(0, 80) : 'fetch error',
    };
  }
}

async function main() {
  const feeds = flattenOpmlFeeds(parseOpml(loadGeneralFeedsOpml()));
  const rows: Row[] = [];
  for (const f of feeds) {
    process.stdout.write(`.`);
    rows.push(await probe(f.title, f.url, f.enabled));
  }
  console.log('\n');

  const bad = rows.filter((r) => r.parsed === 0);
  const ok = rows.filter((r) => r.parsed > 0);
  const folha = rows.filter((r) => /folha/i.test(r.title) || /folha\.uol/i.test(r.url));

  console.log('=== FOLHA ===');
  for (const r of folha) {
    console.log(
      `${r.parsed > 0 ? 'OK' : 'FAIL'} | parsed=${r.parsed} raw~${r.rawHint} | ${r.format} | HTTP ${r.http} | ${r.title}`
    );
    console.log(`     ${r.note} | ${r.url}`);
  }

  console.log('\n=== FAIL (parsed=0) — todo o seed ===');
  for (const r of bad) {
    console.log(
      `FAIL | ${r.title} | HTTP ${r.http} | ${r.format} | raw~${r.rawHint} | ${r.note}`
    );
    console.log(`     ${r.url}`);
  }

  console.log('\n=== OK summary ===');
  console.log(`ok=${ok.length} fail=${bad.length} total=${rows.length}`);
  for (const r of ok) {
    console.log(`OK(${r.parsed}) ${r.title}`);
  }
}

void main();
