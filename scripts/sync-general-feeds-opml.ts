/**
 * Embed an OPML file into the matching TypeScript constant.
 *
 *   npx tsx scripts/sync-general-feeds-opml.ts          # lean (public)
 *   npx tsx scripts/sync-general-feeds-opml.ts --local  # full (gitignored)
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'src', 'data');
const useLocal = process.argv.includes('--local');

const opmlName = useLocal
  ? 'default-general-feeds.local.opml'
  : 'default-general-feeds.opml';
const tsName = useLocal
  ? 'defaultGeneralFeedsOpml.local.ts'
  : 'defaultGeneralFeedsOpml.ts';

const opmlPath = path.join(dataDir, opmlName);
const tsPath = path.join(dataDir, tsName);

if (!fs.existsSync(opmlPath)) {
  console.error(`Missing OPML: ${opmlPath}`);
  process.exit(1);
}

const opml = fs.readFileSync(opmlPath, 'utf8').replace(/\r\n/g, '\n').trimEnd();
const body = opml.endsWith('\n') ? opml : `${opml}\n`;
const ts = `export const DEFAULT_GENERAL_FEEDS_OPML = \`${body}\`;\n`;

fs.writeFileSync(tsPath, ts, 'utf8');
console.log(`Wrote ${path.relative(root, tsPath)} from ${path.relative(root, opmlPath)}`);
