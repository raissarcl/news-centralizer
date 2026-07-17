import assert from 'node:assert/strict';
import { addDays, subDays } from 'date-fns';
import { selectVisibleItems } from '../src/lib/feeds/selectItems';
import { dedupeItemsByLink } from '../src/lib/items/dedupeItems';
import { isPublishedAtDisplayable } from '../src/lib/items/publishDate';
import { sortItemsByPublishedDesc } from '../src/lib/items/sortItems';
import { applyRetention } from '../src/lib/rss/fetchFeed';
import { decodeFeedBody } from '../src/lib/rss/decodeFeedBody';
import { parseFeedXml } from '../src/lib/rss/parseFeedXml';
import { cleanFeedText } from '../src/lib/text/cleanFeedText';
import { migrateBlob, mergeEngBlogsIntoBlob } from '../src/store/migrate';
import type { FeedItem, FeedSource, Folder, PersistedBlob } from '../src/types';

function item(
  id: string,
  feedId: string,
  publishedAt: string,
  overrides: Partial<FeedItem> = {}
): FeedItem {
  return {
    id,
    feedId,
    title: `Item ${id}`,
    link: `https://example.com/${id}`,
    publishedAt,
    read: false,
    starred: false,
    ...overrides,
  };
}

function feed(id: string, folderIds: string[] | string = 'news'): FeedSource {
  const ids = Array.isArray(folderIds) ? folderIds : [folderIds];
  return {
    id,
    title: `Feed ${id}`,
    url: `https://example.com/feed/${id}.xml`,
    spaceId: 'computing',
    folderIds: ids,
    tagIds: [],
    enabled: true,
  };
}

// selectVisibleItems
{
  const feeds = [feed('f1', 'news'), feed('f2', 'news')];
  feeds[1].enabled = false;
  const items = [
    item('i1', 'f1', new Date().toISOString(), { read: false }),
    item('i2', 'f1', new Date().toISOString(), { read: true }),
    item('i3', 'f2', new Date().toISOString()),
  ];
  const unread = selectVisibleItems({
    items,
    feeds,
    timelineFilter: 'unread',
    timelinePeriod: 'all',
    searchQuery: '',
    selectedTagId: null,
    selectedFolderId: null,
  });
  assert.equal(unread.length, 1);
  assert.equal(unread[0].id, 'i1');
}

// dedupeItemsByLink
{
  const deduped = dedupeItemsByLink([
    item('a', 'f1', '2025-01-02T00:00:00.000Z', {
      link: 'https://news.ycombinator.com/item?id=1',
    }),
    item('b', 'f2', '2025-01-01T00:00:00.000Z', {
      link: 'https://news.ycombinator.com/item?id=1',
      read: true,
      starred: true,
    }),
  ]);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].id, 'a');
  assert.equal(deduped[0].read, false);
  assert.equal(deduped[0].starred, true);
}

// selectVisibleItems dedupes same link across feeds
{
  const feeds = [feed('f1', 'news'), feed('f2', 'news')];
  const items = [
    item('i1', 'f1', new Date().toISOString(), {
      link: 'https://example.com/story',
    }),
    item('i2', 'f2', new Date().toISOString(), {
      link: 'https://example.com/story',
    }),
  ];
  const visible = selectVisibleItems({
    items,
    feeds,
    timelineFilter: 'all',
    timelinePeriod: 'all',
    searchQuery: '',
    selectedTagId: null,
    selectedFolderId: null,
  });
  assert.equal(visible.length, 1);
}

// sortItemsByPublishedDesc
{
  const sorted = sortItemsByPublishedDesc([
    item('a', 'f1', '2024-01-01T00:00:00.000Z'),
    item('b', 'f1', '2025-01-01T00:00:00.000Z'),
  ]);
  assert.equal(sorted[0].id, 'b');
}

// cleanFeedText
{
  assert.equal(cleanFeedText('&lt;p&gt;&lt;em&gt;Hello&lt;/em&gt;&lt;/p&gt;'), 'Hello');
  assert.equal(cleanFeedText('<p>World</p>'), 'World');
  assert.equal(cleanFeedText('Plain &amp; simple'), 'Plain & simple');
}

// isPublishedAtDisplayable
{
  assert.equal(isPublishedAtDisplayable(new Date().toISOString()), true);
  assert.equal(isPublishedAtDisplayable(addDays(new Date(), 2).toISOString()), false);
}

// selectVisibleItems hides future-dated items
{
  const feeds = [feed('f1', 'news')];
  const items = [
    item('i1', 'f1', new Date().toISOString()),
    item('i2', 'f1', addDays(new Date(), 5).toISOString()),
  ];
  const visible = selectVisibleItems({
    items,
    feeds,
    timelineFilter: 'all',
    timelinePeriod: 'all',
    searchQuery: '',
    selectedTagId: null,
    selectedFolderId: null,
  });
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, 'i1');
}

// selectVisibleItems read filter
{
  const feeds = [feed('f1', 'news')];
  const items = [
    item('i1', 'f1', new Date().toISOString(), { read: true }),
    item('i2', 'f1', new Date().toISOString(), { read: false }),
  ];
  const readOnly = selectVisibleItems({
    items,
    feeds,
    timelineFilter: 'read',
    timelinePeriod: 'all',
    searchQuery: '',
    selectedTagId: null,
    selectedFolderId: null,
  });
  assert.equal(readOnly.length, 1);
  assert.equal(readOnly[0].id, 'i1');
}

// selectVisibleItems feed filter
{
  const feeds = [feed('f1', 'news'), feed('f2', 'news')];
  const items = [
    item('i1', 'f1', new Date().toISOString()),
    item('i2', 'f2', new Date().toISOString()),
  ];
  const visible = selectVisibleItems({
    items,
    feeds,
    timelineFilter: 'all',
    timelinePeriod: 'all',
    searchQuery: '',
    selectedTagId: null,
    selectedFolderId: null,
    selectedFeedIds: ['f2'],
  });
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, 'i2');

  const multi = selectVisibleItems({
    items,
    feeds,
    timelineFilter: 'all',
    timelinePeriod: 'all',
    searchQuery: '',
    selectedTagId: null,
    selectedFolderId: null,
    selectedFeedIds: ['f1', 'f2'],
  });
  assert.equal(multi.length, 2);
}

// parseFeedXml strips encoded HTML and skips future dates
{
  const rssXml = `<?xml version="1.0"?><rss><channel><item>
    <title>&lt;em&gt;Title&lt;/em&gt;</title>
    <link>https://example.com/a</link>
    <guid>a</guid>
    <description>&lt;p&gt;Summary&lt;/p&gt;</description>
    <pubDate>Wed, 01 Jan 2020 12:00:00 GMT</pubDate>
  </item><item>
    <title>Future</title>
    <link>https://example.com/b</link>
    <guid>b</guid>
    <pubDate>Wed, 01 Jan 2099 12:00:00 GMT</pubDate>
  </item></channel></rss>`;
  const entries = parseFeedXml(rssXml);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, 'Title');
  assert.equal(entries[0].summary, 'Summary');
}

// parseFeedXml supports RSS 1.0 / RDF (Deutsche Welle style)
{
  const rdfXml = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
 <channel rdf:about="https://example.com/feed">
  <title>Channel</title>
 </channel>
 <item rdf:about="https://example.com/a">
  <title>RDF Title</title>
  <link>https://example.com/a</link>
  <description>RDF summary</description>
  <dc:date>2020-01-01T12:00:00Z</dc:date>
 </item>
 <item rdf:about="https://example.com/future">
  <title>Future RDF</title>
  <link>https://example.com/future</link>
  <dc:date>2099-01-01T12:00:00Z</dc:date>
 </item>
</rdf:RDF>`;
  const entries = parseFeedXml(rdfXml);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, 'RDF Title');
  assert.equal(entries[0].link, 'https://example.com/a');
  assert.equal(entries[0].summary, 'RDF summary');
}

// parseFeedXml unwraps Folha redirect links (*https://…)
{
  const rssXml = `<?xml version="1.0"?><rss><channel><item>
    <title>Folha</title>
    <link>https://redir.folha.com.br/redir/online/poder/rss091/*https://www1.folha.uol.com.br/poder/2026/07/exemplo.shtml</link>
    <guid>folha-1</guid>
    <pubDate>Wed, 01 Jan 2020 12:00:00 GMT</pubDate>
  </item></channel></rss>`;
  const entries = parseFeedXml(rssXml);
  assert.equal(entries.length, 1);
  assert.equal(
    entries[0].link,
    'https://www1.folha.uol.com.br/poder/2026/07/exemplo.shtml'
  );
}

// decodeFeedBody respects XML encoding declaration (Folha ISO-8859-1)
{
  const xml =
    '<?xml version="1.0" encoding="ISO-8859-1"?><rss><channel><title>São Paulo</title></channel></rss>';
  const bytes = Uint8Array.from(Buffer.from(xml, 'latin1'));
  const text = decodeFeedBody(bytes, 'text/xml');
  assert.match(text, /São Paulo/);
  assert.equal(text.includes('\uFFFD'), false);
}

// applyRetention
{
  const feeds = [feed('f1')];
  const folders: Folder[] = [
    { id: 'news', name: 'News', spaceId: 'computing', sortOrder: 0 },
  ];
  const old = subDays(new Date(), 40).toISOString();
  const recent = new Date().toISOString();
  const kept = applyRetention(
    [item('old', 'f1', old), item('new', 'f1', recent)],
    30,
    feeds,
    folders
  );
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, 'new');
}

// mergeEngBlogsIntoBlob
{
  const blob: PersistedBlob = {
    schemaVersion: 1,
    spaces: [],
    feeds: [],
    items: [],
    folders: [],
    tags: [],
    settings: {
      theme: 'system',
      locale: 'pt-BR',
      retentionDays: 30,
      refreshOnOpen: true,
      notifyOnNewItems: false,
      allowHttpFeeds: false,
      rssHubAcknowledged: false,
      lastExportAt: null,
      seeded: false,
      seededGeneral: false,
      activeSpaceId: 'computing',
    },
  };
  const merged = mergeEngBlogsIntoBlob(blob);
  assert.ok(merged.feeds.length > 0);
  assert.ok(merged.folders.some((f) => f.name === 'Eng Blogs'));
}

// migrate v3 inbox name + v7 spaces
{
  const migrated = migrateBlob({
    schemaVersion: 1,
    feeds: [],
    items: [],
    folders: [{ id: 'inbox', name: 'Inbox', sortOrder: -1 }],
    tags: [],
    settings: {},
  });
  assert.equal(migrated.schemaVersion, 7);
  assert.equal(
    migrated.folders.find((f) => f.id === 'inbox:computing')?.name,
    'Caixa de entrada'
  );
  assert.ok(migrated.folders.some((f) => f.id === 'inbox:general'));
  assert.equal(migrated.settings.activeSpaceId, 'computing');
}

// migrate v4 removes HN Newest and dedupes items
{
  const migrated = migrateBlob({
    schemaVersion: 3,
    feeds: [
      {
        id: 'hn-front',
        title: 'HN Front',
        url: 'https://hnrss.org/frontpage',
        folderId: 'comunidade',
        tagIds: [],
        enabled: true,
      },
      {
        id: 'hn-newest',
        title: 'HN Newest',
        url: 'https://hnrss.org/newest',
        folderId: 'comunidade',
        tagIds: [],
        enabled: true,
      },
    ],
    items: [
      item('i1', 'hn-front', '2025-01-02T00:00:00.000Z', {
        link: 'https://news.ycombinator.com/item?id=42',
      }),
      item('i2', 'hn-newest', '2025-01-01T00:00:00.000Z', {
        link: 'https://news.ycombinator.com/item?id=42',
      }),
    ],
    folders: [],
    tags: [],
    settings: {},
  });
  assert.equal(migrated.feeds.length, 1);
  assert.equal(migrated.feeds[0].id, 'hn-front');
  assert.equal(migrated.feeds[0].spaceId, 'computing');
  assert.equal(migrated.items.length, 1);
}

// migrate v6 removes HN AI feed
{
  const migrated = migrateBlob({
    schemaVersion: 5,
    feeds: [
      {
        id: 'hn-ai',
        title: 'HN AI',
        url: 'https://hnrss.org/newest?search=AI',
        folderIds: ['ai-ml'],
        tagIds: [],
        enabled: true,
      },
      {
        id: 'openai',
        title: 'OpenAI',
        url: 'https://openai.com/blog/rss.xml',
        folderIds: ['ai-ml'],
        tagIds: [],
        enabled: true,
      },
    ],
    items: [item('i1', 'hn-ai', new Date().toISOString())],
    folders: [],
    tags: [],
    settings: {},
  });
  assert.equal(migrated.feeds.length, 1);
  assert.equal(migrated.feeds[0].id, 'openai');
  assert.equal(migrated.items.length, 0);
}

console.log('All unit tests passed.');
