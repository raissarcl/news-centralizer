import assert from 'node:assert/strict';
import {
  validateFeedUrl,
  validateItemLink,
  unwrapEmbeddedHttpUrl,
  isPrivateHost,
} from '../src/lib/security/urls';
import { filterValidFeedInputs } from '../src/lib/security/importLimits';
import { parseFeedXml, PARSE_LIMITS } from '../src/lib/rss/parseFeedXml';

function testUrls() {
  assert.equal(validateFeedUrl('https://example.com/feed').ok, true);
  assert.equal(validateFeedUrl('http://example.com/feed').ok, false);
  assert.equal(
    validateFeedUrl('http://example.com/feed', { allowHttp: true }).ok,
    true,
  );
  assert.equal(validateFeedUrl('file:///etc/passwd').ok, false);
  assert.equal(validateFeedUrl('javascript:alert(1)').ok, false);
  assert.equal(validateFeedUrl('https://192.168.1.1/feed').ok, false);
  assert.equal(validateFeedUrl('https://localhost/feed').ok, false);
  assert.equal(validateFeedUrl('https://user:pass@example.com/feed').ok, false);

  assert.equal(isPrivateHost('127.0.0.1'), true);
  assert.equal(isPrivateHost('10.0.0.1'), true);
  assert.equal(isPrivateHost('example.com'), false);

  assert.equal(validateItemLink('https://example.com/article').ok, true);
  assert.equal(validateItemLink('http://example.com/article').ok, true);
  assert.equal(validateItemLink('javascript:alert(1)').ok, false);
  assert.equal(validateItemLink('intent://evil').ok, false);

  assert.equal(
    unwrapEmbeddedHttpUrl(
      'https://redir.folha.com.br/redir/online/poder/rss091/*https://www1.folha.uol.com.br/poder/a.shtml',
    ),
    'https://www1.folha.uol.com.br/poder/a.shtml',
  );
  assert.equal(
    unwrapEmbeddedHttpUrl('https://example.com/plain'),
    'https://example.com/plain',
  );
}

function testImportFilter() {
  const { valid, skipped } = filterValidFeedInputs([
    { title: 'OK', url: 'https://example.com/feed' },
    { title: 'Bad', url: 'https://192.168.0.1/feed' },
  ]);
  assert.equal(valid.length, 1);
  assert.equal(skipped, 1);
}

function testParseLimits() {
  const items = Array.from(
    { length: PARSE_LIMITS.maxEntries + 10 },
    (_, i) => ({
      title: `Item ${i}`,
      link: `https://example.com/${i}`,
      guid: `g${i}`,
      pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
    }),
  );
  const xml = `<?xml version="1.0"?><rss><channel>${items
    .map(
      (i) =>
        `<item><title>${i.title}</title><link>${i.link}</link><guid>${i.guid}</guid><pubDate>${i.pubDate}</pubDate></item>`,
    )
    .join('')}</channel></rss>`;
  const parsed = parseFeedXml(xml);
  assert.equal(parsed.length, PARSE_LIMITS.maxEntries);
}

testUrls();
testImportFilter();
testParseLimits();
console.log('security tests OK');
