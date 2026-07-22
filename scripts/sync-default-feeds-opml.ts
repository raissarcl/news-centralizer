/**
 * Embed default-feeds.opml into defaultFeedsOpml.ts.
 *
 *   npx tsx scripts/sync-default-feeds-opml.ts
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'src', 'data');
const opmlPath = path.join(dataDir, 'default-feeds.opml');
const tsPath = path.join(dataDir, 'defaultFeedsOpml.ts');

if (!fs.existsSync(opmlPath)) {
  console.error(`Missing OPML: ${opmlPath}`);
  process.exit(1);
}

const opml = fs.readFileSync(opmlPath, 'utf8').replace(/\r\n/g, '\n').trimEnd();
const body = opml.endsWith('\n') ? opml : `${opml}\n`;
const ts = `export const DEFAULT_FEEDS_OPML = \`${body}\`;\n`;

fs.writeFileSync(tsPath, ts, 'utf8');
console.log(
  `Wrote ${path.relative(root, tsPath)} from ${path.relative(root, opmlPath)}`,
);
