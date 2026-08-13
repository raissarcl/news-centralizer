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
  isFeedFresh,
  mergeRefreshResults,
  refreshStateAfterFetch,
  FEED_FRESH_MS,
  FEED_FORCE_MIN_AGE_MS,
  REFRESH_FAIL_THRESHOLD,
  shouldRefreshFeed,
  sortFeedsByRefreshPriority,
  refreshPriorityScore,
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
import { mergeMissingSeedFeeds } from '../src/lib/opml/seedFromOpml';
import {
  COMPUTING_FEED_CATALOG,
  GENERAL_FEED_CATALOG,
} from '../src/data/feeds/catalogs';
import type { FeedCatalog } from '../src/data/feeds/types';
import legacyGeneralSeed from './fixtures/legacy-general-seed.json';
import legacyComputingSeed from './fixtures/legacy-computing-seed.json';
import { migrateBlob, mergeEngBlogsIntoBlob } from '../src/store/migrate';
import {
  GOOGLE_DEVELOPERS_BLOG_OLD_URL,
  GOOGLE_DEVELOPERS_BLOG_URL,
} from '../src/store/catalogRepairs';
import { normalizeFeedUrl } from '../src/lib/items/dedupeItems';
import type { FeedItem, FeedSource, Folder, PersistedBlob } from '../src/types';
import { DEFAULT_SETTINGS } from '../src/types';

const LEGACY_GENERAL_CATALOG = legacyGeneralSeed as FeedCatalog;
const LEGACY_COMPUTING_CATALOG = legacyComputingSeed as FeedCatalog;

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

// parseFeedXml keeps items without pubDate (channel lastBuildDate / synthetic)
{
  const rssXml = `<?xml version="1.0"?><rss><channel>
    <lastBuildDate>Sun, 02 Aug 2026 12:00:00 GMT</lastBuildDate>
    <item>
      <title>No date item</title>
      <link>https://example.com/undated</link>
      <guid>undated-1</guid>
      <description>Hello</description>
    </item>
  </channel></rss>`;
  const entries = parseFeedXml(rssXml);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, 'No date item');
  assert.ok(entries[0].publishedAt.length > 0);
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
      ...DEFAULT_SETTINGS,
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
  assert.equal(migrated.schemaVersion, 14);
  assert.equal(migrated.settings.seededGeneral, true);
  assert.ok(Array.isArray(migrated.settings.removedFeedUrls));
  assert.ok(migrated.folders.some((f) => f.name === 'Portais'));
  assert.ok(migrated.folders.some((f) => f.name === 'Eng Blogs'));
  assert.equal(
    migrated.folders.find((f) => f.id === 'inbox:computing')?.name,
    'Caixa de entrada',
  );
  assert.ok(migrated.folders.some((f) => f.id === 'inbox:general'));
  assert.equal(migrated.settings.activeSpaceId, 'computing');
}

// migrate v4 removes HN Newest; v9 keeps HN frontpage (main stories)
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
      {
        id: 'lobsters',
        title: 'Lobsters',
        url: 'https://lobste.rs/rss',
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
      item('i3', 'lobsters', '2025-01-03T00:00:00.000Z', {
        link: 'https://lobste.rs/s/abc',
      }),
    ],
    folders: [],
    tags: [],
    settings: {},
  });
  assert.ok(migrated.feeds.some((f) => f.id === 'hn-front'));
  assert.ok(migrated.feeds.some((f) => f.id === 'lobsters'));
  assert.ok(!migrated.feeds.some((f) => f.id === 'hn-newest'));
  assert.equal(
    migrated.feeds.find((f) => f.id === 'hn-front')?.spaceId,
    'computing',
  );
  assert.ok(migrated.items.some((i) => i.id === 'i1'));
  assert.ok(migrated.items.some((i) => i.id === 'i3'));
  assert.ok(!migrated.items.some((i) => i.id === 'i2'));
}

// migrate v9 retires Folha SP, UOL Notícias, DW titulares, DEV (keeps DW seção + Folha PE)
{
  const migrated = migrateBlob({
    schemaVersion: 8,
    feeds: [
      {
        id: 'folha',
        title: 'Folha Poder',
        url: 'https://feeds.folha.uol.com.br/poder/rss091.xml',
        spaceId: 'general',
        folderIds: ['portais'],
        tagIds: [],
        enabled: true,
      },
      {
        id: 'uol',
        title: 'UOL Notícias',
        url: 'https://rss.uol.com.br/feed/noticias.xml',
        spaceId: 'general',
        folderIds: ['portais'],
        tagIds: [],
        enabled: true,
      },
      {
        id: 'dw-top',
        title: 'DW Brasil - Titulares',
        url: 'https://rss.dw.com/rdf/rss-br-top',
        spaceId: 'general',
        folderIds: ['intl'],
        tagIds: [],
        enabled: true,
      },
      {
        id: 'dw-br',
        title: 'DW Brasil - Seção Brasil',
        url: 'https://rss.dw.com/rdf/rss-br-br',
        spaceId: 'general',
        folderIds: ['intl'],
        tagIds: [],
        enabled: true,
      },
      {
        id: 'folhape',
        title: 'Folha de Pernambuco',
        url: 'https://www.folhape.com.br/noticias/feed/',
        spaceId: 'general',
        folderIds: ['regional'],
        tagIds: [],
        enabled: true,
      },
      {
        id: 'devto',
        title: 'DEV Community',
        url: 'https://dev.to/feed',
        spaceId: 'computing',
        folderIds: ['comunidade'],
        tagIds: [],
        enabled: true,
      },
    ],
    items: [],
    folders: [],
    tags: [],
    settings: {},
  });
  assert.ok(migrated.feeds.some((f) => f.id === 'dw-br'));
  assert.ok(migrated.feeds.some((f) => f.id === 'folhape'));
  assert.ok(!migrated.feeds.some((f) => f.id === 'folha'));
  assert.ok(!migrated.feeds.some((f) => f.id === 'uol'));
  assert.ok(!migrated.feeds.some((f) => f.id === 'dw-top'));
  assert.ok(!migrated.feeds.some((f) => f.id === 'devto'));
  // v10 also ensures HN frontpage exists
  assert.ok(migrated.feeds.some((f) => f.url.includes('hnrss.org/frontpage')));
}

// migrate v10 restores HN frontpage if missing
{
  const migrated = migrateBlob({
    schemaVersion: 9,
    feeds: [
      {
        id: 'lobsters',
        title: 'Lobsters',
        url: 'https://lobste.rs/rss',
        spaceId: 'computing',
        folderIds: ['comunidade'],
        tagIds: [],
        enabled: true,
      },
    ],
    items: [],
    folders: [
      {
        id: 'comunidade',
        name: 'Comunidade',
        spaceId: 'computing',
        sortOrder: 0,
      },
    ],
    tags: [],
    settings: {},
  });
  assert.ok(migrated.feeds.some((f) => f.url.includes('hnrss.org/frontpage')));
  assert.ok(migrated.feeds.some((f) => f.id === 'lobsters'));
}

// mergeMissingSeedFeeds adds Cultura pop when only Portais exist (legacy catalog)
{
  const spaceId = 'general';
  const existingFolders: Folder[] = [
    {
      id: 'general-portais',
      name: 'Portais',
      spaceId,
      sortOrder: 0,
    },
  ];
  const existingFeeds: FeedSource[] = [
    {
      ...feed('cnn', ['general-portais']),
      spaceId,
      url: 'https://www.cnnbrasil.com.br/feed/',
      title: 'CNN Brasil',
    },
  ];
  const merged = mergeMissingSeedFeeds(
    existingFolders,
    existingFeeds,
    LEGACY_GENERAL_CATALOG,
    spaceId,
    { allowHttp: false },
  );
  assert.ok(merged.added > 0);
  assert.ok(merged.folders.some((f) => f.name === 'Cultura pop'));
  assert.ok(merged.feeds.some((f) => f.title === 'Contigo!'));
  assert.ok(merged.feeds.some((f) => f.id === 'cnn'));
}

// mergeMissingSeedFeeds skips tombstoned URLs (legacy catalog)
{
  const spaceId = 'general';
  const contigoUrl = 'https://www.contigo.com.br/feed/';
  const merged = mergeMissingSeedFeeds(
    [
      {
        id: 'general-portais',
        name: 'Portais',
        spaceId,
        sortOrder: 0,
      },
    ],
    [
      {
        ...feed('cnn', ['general-portais']),
        spaceId,
        url: 'https://www.cnnbrasil.com.br/feed/',
        title: 'CNN Brasil',
      },
    ],
    LEGACY_GENERAL_CATALOG,
    spaceId,
    {
      allowHttp: false,
      removedFeedUrls: [normalizeFeedUrl(contigoUrl)],
    },
  );
  assert.ok(!merged.feeds.some((f) => /contigo\.com\.br/i.test(f.url)));
  assert.ok(merged.feeds.some((f) => f.id === 'cnn'));
}

// public lean catalog merge still respects tombstones
{
  const spaceId = 'general';
  const globoNewsUrl = 'https://g1.globo.com/dynamo/globonews/rss2.xml';
  const merged = mergeMissingSeedFeeds(
    [
      {
        id: 'general-portais',
        name: 'Portais',
        spaceId,
        sortOrder: 0,
      },
    ],
    [
      {
        ...feed('g1', ['general-portais']),
        spaceId,
        url: 'https://g1.globo.com/dynamo/rss2.xml',
        title: 'G1',
      },
    ],
    GENERAL_FEED_CATALOG,
    spaceId,
    {
      allowHttp: false,
      removedFeedUrls: [normalizeFeedUrl(globoNewsUrl)],
    },
  );
  assert.ok(!merged.feeds.some((f) => /globonews/i.test(f.url)));
  assert.ok(merged.feeds.some((f) => f.id === 'g1'));
  assert.equal(merged.added, 0);
}

// migrate v11 merges missing public general seed feeds (Globo News)
{
  const migrated = migrateBlob({
    schemaVersion: 10,
    feeds: [
      {
        id: 'g1',
        title: 'G1',
        url: 'https://g1.globo.com/dynamo/rss2.xml',
        spaceId: 'general',
        folderIds: ['general-portais'],
        tagIds: [],
        enabled: true,
      },
    ],
    items: [],
    folders: [
      {
        id: 'general-portais',
        name: 'Portais',
        spaceId: 'general',
        sortOrder: 0,
      },
    ],
    tags: [],
    settings: { seededGeneral: true },
  });
  assert.ok(migrated.feeds.some((f) => /globonews/i.test(f.url)));
  assert.ok(migrated.feeds.some((f) => f.id === 'g1'));
  assert.ok(!migrated.feeds.some((f) => f.title === 'Contigo!'));
}

// migrate v13 merges lean computing seed + eng blogs (not full legacy catalog)
{
  const migrated = migrateBlob({
    schemaVersion: 12,
    feeds: [
      {
        id: 'lobsters',
        title: 'Lobsters',
        url: 'https://lobste.rs/rss',
        spaceId: 'computing',
        folderIds: ['comunidade'],
        tagIds: [],
        enabled: true,
      },
    ],
    items: [],
    folders: [
      {
        id: 'comunidade',
        name: 'Comunidade',
        spaceId: 'computing',
        sortOrder: 0,
      },
    ],
    tags: [],
    settings: { seeded: true },
  });
  assert.ok(migrated.feeds.some((f) => f.url.includes('hnrss.org/frontpage')));
  assert.ok(migrated.feeds.some((f) => /tabnews\.com\.br/i.test(f.url)));
  assert.ok(migrated.feeds.some((f) => f.id === 'lobsters'));
  assert.ok(migrated.folders.some((f) => f.name === 'Eng Blogs'));
  assert.ok(!migrated.feeds.some((f) => f.title === 'React Blog'));
  assert.ok(!migrated.feeds.some((f) => /dev\.to\/feed/i.test(f.url)));
}

// legacy computing catalog still restores React Blog when merged directly
{
  const merged = mergeMissingSeedFeeds(
    [
      {
        id: 'comunidade',
        name: 'Comunidade',
        spaceId: 'computing',
        sortOrder: 0,
      },
    ],
    [
      {
        ...feed('lobsters', ['comunidade']),
        spaceId: 'computing',
        url: 'https://lobste.rs/rss',
        title: 'Lobsters',
      },
    ],
    LEGACY_COMPUTING_CATALOG,
    'computing',
    { allowHttp: false },
  );
  assert.ok(merged.feeds.some((f) => f.title === 'React Blog'));
  assert.ok(merged.feeds.some((f) => f.title === 'web.dev'));
}

// current schema migrate does not restore tombstoned URLs or flip disabled feeds
{
  const disabledUrl = 'https://g1.globo.com/dynamo/rss2.xml';
  const removedUrl = 'https://g1.globo.com/dynamo/globonews/rss2.xml';
  const migrated = migrateBlob({
    schemaVersion: 14,
    feeds: [
      {
        id: 'g1',
        title: 'G1',
        url: disabledUrl,
        spaceId: 'general',
        folderIds: ['general-portais'],
        tagIds: [],
        enabled: false,
      },
    ],
    items: [],
    folders: [
      {
        id: 'general-portais',
        name: 'Portais',
        spaceId: 'general',
        sortOrder: 0,
      },
    ],
    tags: [],
    settings: {
      seeded: true,
      seededGeneral: true,
      removedFeedUrls: [normalizeFeedUrl(removedUrl)],
    },
  });
  assert.equal(migrated.feeds.find((f) => f.id === 'g1')?.enabled, false);
  assert.ok(!migrated.feeds.some((f) => /globonews/i.test(f.url)));
  assert.ok(
    migrated.settings.removedFeedUrls.includes(normalizeFeedUrl(removedUrl)),
  );
  // Public lean catalog is not re-merged on schema 14.
  assert.equal(migrated.feeds.length, 1);
}

// public catalogs stay lean (2 example feeds each)
{
  assert.equal(
    COMPUTING_FEED_CATALOG.folders.reduce((n, f) => n + f.feeds.length, 0),
    2,
  );
  assert.equal(
    GENERAL_FEED_CATALOG.folders.reduce((n, f) => n + f.feeds.length, 0),
    2,
  );
}

// migrate v14 rewrites Google Developers Blog URL
{
  const migrated = migrateBlob({
    schemaVersion: 13,
    feeds: [
      {
        id: 'gdb',
        title: 'Google Developers Blog',
        url: 'https://developers.googleblog.com/feeds/posts/default',
        spaceId: 'computing',
        folderIds: ['eng-blogs'],
        tagIds: [],
        enabled: true,
      },
    ],
    items: [],
    folders: [
      {
        id: 'eng-blogs',
        name: 'Eng Blogs',
        spaceId: 'computing',
        sortOrder: 0,
      },
    ],
    tags: [],
    settings: { seeded: true },
  });
  const gdb = migrated.feeds.find((f) => f.id === 'gdb');
  assert.equal(gdb?.url, GOOGLE_DEVELOPERS_BLOG_URL);
  assert.equal(
    normalizeFeedUrl(gdb!.url),
    normalizeFeedUrl(GOOGLE_DEVELOPERS_BLOG_URL),
  );
}

// migrate does not restore tombstoned Google Developers Blog
{
  const migrated = migrateBlob({
    schemaVersion: 12,
    feeds: [
      {
        id: 'lobsters',
        title: 'Lobsters',
        url: 'https://lobste.rs/rss',
        spaceId: 'computing',
        folderIds: ['comunidade'],
        tagIds: [],
        enabled: true,
      },
    ],
    items: [],
    folders: [
      {
        id: 'comunidade',
        name: 'Comunidade',
        spaceId: 'computing',
        sortOrder: 0,
      },
    ],
    tags: [],
    settings: {
      seeded: true,
      removedFeedUrls: [
        GOOGLE_DEVELOPERS_BLOG_OLD_URL,
        normalizeFeedUrl(GOOGLE_DEVELOPERS_BLOG_URL),
      ],
    },
  });
  assert.ok(
    !migrated.feeds.some(
      (f) =>
        normalizeFeedUrl(f.url) === GOOGLE_DEVELOPERS_BLOG_OLD_URL ||
        normalizeFeedUrl(f.url) ===
          normalizeFeedUrl(GOOGLE_DEVELOPERS_BLOG_URL),
    ),
  );
  assert.ok(migrated.feeds.some((f) => f.id === 'lobsters'));
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
  assert.ok(migrated.feeds.some((f) => f.id === 'openai'));
  assert.ok(!migrated.feeds.some((f) => f.id === 'hn-ai'));
  assert.ok(migrated.feeds.some((f) => f.url.includes('hnrss.org/frontpage')));
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

// isFeedFresh skips recent successful fetches
{
  const now = Date.parse('2026-01-02T00:00:00.000Z');
  const fresh = feed('fresh');
  fresh.lastFetchedAt = new Date(now - FEED_FRESH_MS / 2).toISOString();
  fresh.lastError = undefined;
  assert.equal(isFeedFresh(fresh, now), true);

  const stale = feed('stale');
  stale.lastFetchedAt = new Date(now - FEED_FRESH_MS - 1).toISOString();
  assert.equal(isFeedFresh(stale, now), false);

  const errored = feed('err');
  errored.lastFetchedAt = new Date(now - 1000).toISOString();
  errored.lastError = 'network';
  assert.equal(isFeedFresh(errored, now), false);
}

// soft force skips feeds fetched within FEED_FORCE_MIN_AGE_MS
{
  const now = Date.now();
  const recent = feed('recent');
  recent.lastFetchedAt = new Date(now - 30_000).toISOString();
  assert.equal(shouldRefreshFeed(recent, true, now), false);
  assert.equal(shouldRefreshFeed(recent, false, now), false);

  const softStale = feed('soft-stale');
  softStale.lastFetchedAt = new Date(
    now - FEED_FORCE_MIN_AGE_MS - 1,
  ).toISOString();
  assert.equal(shouldRefreshFeed(softStale, true, now), true);
  // Still fresh for non-force (15 min window)
  assert.equal(shouldRefreshFeed(softStale, false, now), false);

  const erroredSoft = feed('err-soft');
  erroredSoft.lastFetchedAt = new Date(now - 10_000).toISOString();
  erroredSoft.lastError = 'HTTP 403';
  assert.equal(shouldRefreshFeed(erroredSoft, true, now), true);
}

// sortFeedsByRefreshPriority: healthy+etag before errored
{
  const withEtag = { ...feed('ok'), etag: '"abc"', lastError: undefined };
  const plain = { ...feed('plain'), lastError: undefined };
  const erroredPri = {
    ...feed('bad'),
    lastError: 'timeout',
    refreshFailCount: 2,
  };
  const ordered = sortFeedsByRefreshPriority([erroredPri, plain, withEtag]);
  assert.equal(ordered[0].id, 'ok');
  assert.equal(ordered[1].id, 'plain');
  assert.equal(ordered[2].id, 'bad');
  assert.ok(refreshPriorityScore(withEtag) < refreshPriorityScore(erroredPri));
}

// mergeRefreshResults passes retryOn403 to fetchFeedFn
async function testRetryOn403Option() {
  const seen: boolean[] = [];
  await mergeRefreshResults([feed('a')], [feed('a')], [], {
    allowHttp: false,
    retryOn403: false,
    fetchFeedFn: async (_source, options) => {
      seen.push(options?.retryOn403 === true);
      return { notModified: true, entries: [] };
    },
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0], false);

  seen.length = 0;
  await mergeRefreshResults([feed('a')], [feed('a')], [], {
    allowHttp: false,
    retryOn403: true,
    fetchFeedFn: async (_source, options) => {
      seen.push(options?.retryOn403 === true);
      return { notModified: true, entries: [] };
    },
  });
  assert.equal(seen[0], true);
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
  let batchCalls = 0;
  let batchNewItems = 0;
  const result = await mergeRefreshResults(feeds, feeds, existing, {
    allowHttp: false,
    now: Date.parse('2026-01-02T00:00:00.000Z'),
    onFeedBatch: (batch) => {
      batchCalls += 1;
      batchNewItems += batch.newItems.length;
    },
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
  assert.ok(batchCalls >= 1);
  assert.equal(batchNewItems, 1);
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
  .then(() => testRetryOn403Option())
  .then(() => {
    console.log('All unit tests passed.');
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
