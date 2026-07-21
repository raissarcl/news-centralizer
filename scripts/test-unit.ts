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
import {
  applyRefreshOntoCurrent,
  mergeRefreshResults,
  refreshStateAfterFetch,
  REFRESH_FAIL_THRESHOLD,
} from '../src/lib/feeds/refreshMerge';
import {
  addFeedToFolder,
  feedInFolder,
  getFeedFolderIds,
  inboxFolderId,
  removeFeedFromFolder,
  toggleFeedFolderMembership,
} from '../src/lib/feeds/feedFolders';
import { applyOpmlImport } from '../src/lib/opml/importFeeds';
import { migrateBlob, mergeEngBlogsIntoBlob } from '../src/store/migrate';
import type { FeedItem, FeedSource, Folder, PersistedBlob } from '../src/types';

function item(
  id: string,
  feedId: string,
  publishedAt: string,
  overrides: Partial<FeedItem> = {},
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
  assert.equal(
    cleanFeedText('&lt;p&gt;&lt;em&gt;Hello&lt;/em&gt;&lt;/p&gt;'),
    'Hello',
  );
  assert.equal(cleanFeedText('<p>World</p>'), 'World');
  assert.equal(cleanFeedText('Plain &amp; simple'), 'Plain & simple');
}

// isPublishedAtDisplayable
{
  assert.equal(isPublishedAtDisplayable(new Date().toISOString()), true);
  assert.equal(
    isPublishedAtDisplayable(addDays(new Date(), 2).toISOString()),
    false,
  );
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
    'https://www1.folha.uol.com.br/poder/2026/07/exemplo.shtml',
  );
}

// decodeFeedBody respects XML encoding declaration (Folha ISO-8859-1)
{
  const xml =
    '<?xml version="1.0" encoding="ISO-8859-1"?><rss><channel><title>São Paulo</title></channel></rss>';
  // latin1 bytes without Node Buffer (Expo tsconfig has no @types/node)
  const bytes = Uint8Array.from(
    Array.from(xml, (ch) => ch.charCodeAt(0) & 0xff),
  );
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
    folders,
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
  assert.equal(migrated.schemaVersion, 8);
  assert.equal(migrated.settings.seededGeneral, false);
  assert.equal(
    migrated.folders.find((f) => f.id === 'inbox:computing')?.name,
    'Caixa de entrada',
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

// applyRefreshOntoCurrent preserves enabled/delete against stale refresh patches
{
  const folders: Folder[] = [
    { id: 'news', name: 'News', spaceId: 'computing', sortOrder: 0 },
  ];
  const currentFeeds = [
    { ...feed('a', 'news'), enabled: false, etag: 'old-a' },
    { ...feed('b', 'news'), enabled: true, etag: 'old-b' },
  ];
  const currentItems = [item('i1', 'a', new Date().toISOString())];
  const feedUpdates = new Map([
    [
      'a',
      {
        refreshFailCount: 0,
        refreshPausedUntil: undefined,
        favicon: undefined,
        lastFetchedAt: new Date().toISOString(),
        etag: 'new-a',
        lastModified: undefined,
        lastError: undefined,
      },
    ],
    [
      'gone',
      {
        refreshFailCount: 0,
        refreshPausedUntil: undefined,
        favicon: undefined,
        lastFetchedAt: new Date().toISOString(),
        etag: 'stale',
        lastModified: undefined,
        lastError: undefined,
      },
    ],
  ]);
  const newItems = [
    item('i2', 'a', new Date().toISOString()),
    item('i3', 'gone', new Date().toISOString()),
  ];
  const applied = applyRefreshOntoCurrent(
    currentFeeds,
    currentItems,
    feedUpdates,
    newItems,
    new Map(),
    folders,
    30,
  );
  assert.equal(applied.feeds.length, 2);
  assert.equal(applied.feeds.find((f) => f.id === 'a')?.enabled, false);
  assert.equal(applied.feeds.find((f) => f.id === 'a')?.etag, 'new-a');
  assert.ok(!applied.feeds.some((f) => f.id === 'gone'));
  assert.ok(applied.items.some((i) => i.id === 'i2'));
  assert.ok(!applied.items.some((i) => i.id === 'i3'));
}

// refreshStateAfterFetch pauses after threshold failures
{
  const f = feed('f1');
  f.refreshFailCount = REFRESH_FAIL_THRESHOLD - 1;
  const now = Date.parse('2026-01-01T00:00:00.000Z');
  const paused = refreshStateAfterFetch(f, 'network', now);
  assert.equal(paused.refreshFailCount, REFRESH_FAIL_THRESHOLD);
  assert.ok(paused.refreshPausedUntil);
  const ok = refreshStateAfterFetch(f, undefined, now);
  assert.equal(ok.refreshFailCount, 0);
  assert.equal(ok.refreshPausedUntil, undefined);
}

// mergeRefreshResults: space-scoped link dedupe + injected fetch
async function testMergeRefreshResults() {
  const feeds = [
    { ...feed('a', 'news'), spaceId: 'computing' },
    { ...feed('b', 'news'), spaceId: 'general' },
  ];
  const existing = [
    item('old', 'a', '2026-01-01T00:00:00.000Z', {
      link: 'https://example.com/shared',
    }),
  ];
  const result = await mergeRefreshResults(feeds, feeds, existing, {
    allowHttp: false,
    now: Date.parse('2026-01-02T00:00:00.000Z'),
    fetchFeedFn: async (source) => ({
      notModified: false,
      entries: [
        {
          id: `${source.id}-new`,
          title: `From ${source.id}`,
          link: 'https://example.com/shared',
          publishedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    }),
  });
  // Same link in computing is a dupe; general may still add it.
  assert.equal(result.newItems.length, 1);
  assert.equal(result.newItems[0].feedId, 'b');
  assert.equal(result.newCountBySpace.general, 1);
  assert.equal(result.newCountBySpace.computing ?? 0, 0);
}

// applyOpmlImport merge + replace
{
  const spaceId = 'computing';
  const inboxId = inboxFolderId(spaceId);
  const state = {
    folders: [
      { id: inboxId, name: 'Caixa de entrada', spaceId, sortOrder: -1 },
    ],
    feeds: [
      {
        ...feed('existing'),
        url: 'https://example.com/a.xml',
        folderIds: [inboxId],
      },
    ],
    items: [item('i1', 'existing', new Date().toISOString())],
    tags: [{ id: 't1', name: 'Tag', spaceId }],
  };
  const merged = applyOpmlImport(
    state,
    [
      {
        title: 'A',
        url: 'https://example.com/a.xml',
        folderName: 'News',
      },
      {
        title: 'B',
        url: 'https://example.com/b.xml',
        folderName: 'News',
      },
    ],
    'merge',
    spaceId,
  );
  assert.equal(merged.added, 2);
  assert.ok(merged.folders.some((f) => f.name === 'News'));
  assert.ok(merged.feeds.some((f) => f.url === 'https://example.com/b.xml'));
  assert.ok(
    feedInFolder(
      merged.feeds.find((f) => f.url === 'https://example.com/a.xml')!,
      merged.folders.find((f) => f.name === 'News')!.id,
    ),
  );

  const replaced = applyOpmlImport(
    state,
    [
      {
        title: 'Only',
        url: 'https://example.com/only.xml',
        folderName: 'Solo',
      },
    ],
    'replace',
    spaceId,
  );
  assert.equal(replaced.added, 1);
  assert.equal(replaced.feeds.filter((f) => f.spaceId === spaceId).length, 1);
  assert.equal(replaced.items.length, 0);
  assert.equal(replaced.tags.length, 0);
}

// folder membership toggle + inbox fallback on remove
{
  const spaceId = 'computing';
  const inboxId = inboxFolderId(spaceId);
  const folderId = 'news';
  let f: FeedSource = {
    ...feed('f1', [folderId]),
    spaceId,
  };
  assert.ok(feedInFolder(f, folderId));
  // Cannot leave the last folder — toggle returns null.
  assert.equal(toggleFeedFolderMembership(f, folderId), null);

  f = addFeedToFolder(f, inboxId);
  assert.ok(feedInFolder(f, inboxId));
  const removed = toggleFeedFolderMembership(f, folderId);
  assert.ok(removed);
  f = removed!;
  assert.ok(!feedInFolder(f, folderId));
  assert.ok(feedInFolder(f, inboxId));

  // Simulate folder delete: strip membership then fall back to inbox.
  f = { ...feed('f2', [folderId]), spaceId };
  f = removeFeedFromFolder(f, folderId);
  if (getFeedFolderIds(f).length === 0) {
    f = addFeedToFolder(f, inboxId);
  }
  assert.ok(feedInFolder(f, inboxId));
}

void testMergeRefreshResults()
  .then(() => {
    console.log('All unit tests passed.');
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
