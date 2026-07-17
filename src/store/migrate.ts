import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  type FeedItem,
  type FeedSource,
  type Folder,
  type PersistedBlob,
  type Settings,
  type Space,
  type Tag,
} from '../types';
import { validateFeedUrl } from '../lib/security/urls';
import { ENGBLOGS_STARTER_OPML } from '../data/engblogsStarter';
import { flattenOpmlFeeds, parseOpml } from '../lib/opml';
import { createId } from '../lib/id';
import { sortItemsByPublishedDesc } from '../lib/items/sortItems';
import { dedupeItemsByLink, normalizeFeedUrl } from '../lib/items/dedupeItems';
import {
  inboxFolderId,
  isInboxFolderId,
  LEGACY_INBOX_FOLDER_ID,
  normalizeFeedFolderIds,
} from '../lib/feeds/feedFolders';
import {
  COMPUTING_SPACE_ID,
  ensureDefaultSpaces,
  GENERAL_SPACE_ID,
  getDefaultSpaces,
  resolveActiveSpaceId,
} from '../lib/spaces';

const INBOX_FOLDER_NAME = 'Caixa de entrada';

function normalizeSettings(raw: Partial<Settings> | undefined): Settings {
  const merged: Settings = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  const retentionDays =
    typeof merged.retentionDays === 'number' && merged.retentionDays > 0
      ? Math.min(merged.retentionDays, 365)
      : DEFAULT_SETTINGS.retentionDays;
  return {
    theme:
      merged.theme === 'light' || merged.theme === 'dark' || merged.theme === 'system'
        ? merged.theme
        : DEFAULT_SETTINGS.theme,
    locale: merged.locale === 'en-US' ? 'en-US' : 'pt-BR',
    retentionDays,
    refreshOnOpen: merged.refreshOnOpen !== false,
    notifyOnNewItems: merged.notifyOnNewItems === true,
    allowHttpFeeds: merged.allowHttpFeeds === true,
    rssHubAcknowledged: merged.rssHubAcknowledged === true,
    lastExportAt:
      typeof merged.lastExportAt === 'string' && merged.lastExportAt.length > 0
        ? merged.lastExportAt
        : null,
    seeded: merged.seeded === true,
    seededGeneral: merged.seededGeneral === true,
    activeSpaceId:
      typeof merged.activeSpaceId === 'string' && merged.activeSpaceId.length > 0
        ? merged.activeSpaceId
        : DEFAULT_SETTINGS.activeSpaceId,
  };
}

function normalizeSpace(raw: unknown): Space | null {
  if (!raw || typeof raw !== 'object') return null;
  const x = raw as Record<string, unknown>;
  if (typeof x.id !== 'string' || typeof x.name !== 'string') return null;
  return {
    id: x.id,
    name: x.name,
    icon: typeof x.icon === 'string' ? x.icon : undefined,
    sortOrder: typeof x.sortOrder === 'number' ? x.sortOrder : 0,
  };
}

function normalizeFeed(raw: unknown, allowHttp: boolean): FeedSource | null {
  if (!raw || typeof raw !== 'object') return null;
  const x = raw as Record<string, unknown>;
  if (typeof x.id !== 'string' || typeof x.url !== 'string') return null;
  if (!validateFeedUrl(x.url, { allowHttp }).ok) return null;

  const spaceId =
    typeof x.spaceId === 'string' && x.spaceId.length > 0
      ? x.spaceId
      : COMPUTING_SPACE_ID;

  const rawFolderIds = Array.isArray(x.folderIds)
    ? (x.folderIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : typeof x.folderId === 'string'
      ? [x.folderId]
      : [inboxFolderId(spaceId)];

  return {
    id: x.id,
    title: typeof x.title === 'string' ? x.title : x.url,
    url: x.url,
    siteUrl: typeof x.siteUrl === 'string' ? x.siteUrl : undefined,
    favicon: typeof x.favicon === 'string' ? x.favicon : undefined,
    spaceId,
    folderIds: normalizeFeedFolderIds(rawFolderIds, spaceId),
    tagIds: Array.isArray(x.tagIds)
      ? (x.tagIds as unknown[]).filter((t): t is string => typeof t === 'string')
      : [],
    enabled: x.enabled !== false,
    lastFetchedAt:
      typeof x.lastFetchedAt === 'string' ? x.lastFetchedAt : undefined,
    etag: typeof x.etag === 'string' ? x.etag : undefined,
    lastModified: typeof x.lastModified === 'string' ? x.lastModified : undefined,
    lastError: typeof x.lastError === 'string' ? x.lastError : undefined,
    refreshFailCount:
      typeof x.refreshFailCount === 'number' ? x.refreshFailCount : undefined,
    refreshPausedUntil:
      typeof x.refreshPausedUntil === 'string' ? x.refreshPausedUntil : undefined,
  };
}

function normalizeItem(raw: unknown): FeedItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const x = raw as Record<string, unknown>;
  if (
    typeof x.id !== 'string' ||
    typeof x.feedId !== 'string' ||
    typeof x.title !== 'string' ||
    typeof x.link !== 'string'
  ) {
    return null;
  }
  return {
    id: x.id,
    feedId: x.feedId,
    title: x.title,
    link: x.link,
    summary: typeof x.summary === 'string' ? x.summary : undefined,
    imageUrl: typeof x.imageUrl === 'string' ? x.imageUrl : undefined,
    publishedAt:
      typeof x.publishedAt === 'string'
        ? x.publishedAt
        : new Date().toISOString(),
    read: x.read === true,
    starred: x.starred === true,
  };
}

function normalizeFolder(raw: unknown): Folder | null {
  if (!raw || typeof raw !== 'object') return null;
  const x = raw as Record<string, unknown>;
  if (typeof x.id !== 'string' || typeof x.name !== 'string') return null;
  const spaceId =
    typeof x.spaceId === 'string' && x.spaceId.length > 0
      ? x.spaceId
      : COMPUTING_SPACE_ID;
  return {
    id: x.id === LEGACY_INBOX_FOLDER_ID ? inboxFolderId(spaceId) : x.id,
    name: x.name,
    spaceId,
    icon: typeof x.icon === 'string' ? x.icon : undefined,
    sortOrder: typeof x.sortOrder === 'number' ? x.sortOrder : 0,
    retentionDays:
      typeof x.retentionDays === 'number' && x.retentionDays > 0
        ? x.retentionDays
        : undefined,
  };
}

function normalizeTag(raw: unknown): Tag | null {
  if (!raw || typeof raw !== 'object') return null;
  const x = raw as Record<string, unknown>;
  if (typeof x.id !== 'string' || typeof x.name !== 'string') return null;
  return {
    id: x.id,
    name: x.name,
    spaceId:
      typeof x.spaceId === 'string' && x.spaceId.length > 0
        ? x.spaceId
        : COMPUTING_SPACE_ID,
    color: typeof x.color === 'string' ? x.color : undefined,
  };
}

function slugifyFolder(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function mergeEngBlogsIntoBlob(blob: PersistedBlob): PersistedBlob {
  const outlines = parseOpml(ENGBLOGS_STARTER_OPML);
  const feedInputs = flattenOpmlFeeds(outlines).filter(
    (input) => validateFeedUrl(input.url, { allowHttp: blob.settings.allowHttpFeeds }).ok
  );
  const existingUrls = new Set(blob.feeds.map((f) => f.url));
  let folders = [...blob.folders];
  const folderIdByName = new Map(
    folders
      .filter((f) => f.spaceId === COMPUTING_SPACE_ID)
      .map((f) => [f.name, f.id])
  );
  const feeds = [...blob.feeds];
  let added = 0;

  for (const input of feedInputs) {
    if (existingUrls.has(input.url)) continue;
    const folderName = input.folderName ?? 'Eng Blogs';
    let folderId = folderIdByName.get(folderName);
    if (!folderId) {
      const folder: Folder = {
        id: slugifyFolder(folderName) || createId('folder'),
        name: folderName,
        spaceId: COMPUTING_SPACE_ID,
        sortOrder: folders.length,
      };
      folders = [...folders, folder];
      folderId = folder.id;
      folderIdByName.set(folderName, folderId);
    }
    feeds.push({
      id: createId('feed'),
      title: input.title,
      url: input.url,
      siteUrl: input.siteUrl,
      spaceId: COMPUTING_SPACE_ID,
      folderIds: normalizeFeedFolderIds([folderId], COMPUTING_SPACE_ID),
      tagIds: [],
      enabled: true,
    });
    existingUrls.add(input.url);
    added += 1;
  }

  if (added === 0) return blob;
  return { ...blob, folders, feeds };
}

const REDUNDANT_HN_NEWEST_URL = normalizeFeedUrl('https://hnrss.org/newest');
const BROKEN_HN_AI_URL = normalizeFeedUrl('https://hnrss.org/newest?search=AI');

function removeFeedsByUrl(blob: PersistedBlob, normalizedUrl: string): PersistedBlob {
  const removedFeedIds = new Set(
    blob.feeds
      .filter((f) => normalizeFeedUrl(f.url) === normalizedUrl)
      .map((f) => f.id)
  );
  if (removedFeedIds.size === 0) return blob;
  const feeds = blob.feeds.filter((f) => !removedFeedIds.has(f.id));
  const items = blob.items.filter((i) => !removedFeedIds.has(i.feedId));
  return { ...blob, feeds, items };
}

export function dedupeHnAndItems(blob: PersistedBlob): PersistedBlob {
  const removedFeedIds = new Set(
    blob.feeds
      .filter((f) => normalizeFeedUrl(f.url) === REDUNDANT_HN_NEWEST_URL)
      .map((f) => f.id)
  );
  const feeds = blob.feeds.filter((f) => !removedFeedIds.has(f.id));
  const items = dedupeItemsByLink(
    blob.items.filter((i) => !removedFeedIds.has(i.feedId))
  );
  return { ...blob, feeds, items };
}

export function removeBrokenHnAiFeed(blob: PersistedBlob): PersistedBlob {
  return removeFeedsByUrl(blob, BROKEN_HN_AI_URL);
}

function migrateToSpaces(blob: PersistedBlob): PersistedBlob {
  const spaces = ensureDefaultSpaces(blob.spaces);
  const computingInboxId = inboxFolderId(COMPUTING_SPACE_ID);
  const generalInboxId = inboxFolderId(GENERAL_SPACE_ID);

  let folders = blob.folders.map((folder) => {
    const id =
      folder.id === LEGACY_INBOX_FOLDER_ID ? computingInboxId : folder.id;
    return {
      ...folder,
      id,
      spaceId: folder.spaceId || COMPUTING_SPACE_ID,
      name: isInboxFolderId(id) ? INBOX_FOLDER_NAME : folder.name,
    };
  });

  if (!folders.some((f) => f.id === computingInboxId)) {
    folders = [
      {
        id: computingInboxId,
        name: INBOX_FOLDER_NAME,
        spaceId: COMPUTING_SPACE_ID,
        sortOrder: -1,
      },
      ...folders,
    ];
  }

  if (!folders.some((f) => f.id === generalInboxId)) {
    folders = [
      ...folders,
      {
        id: generalInboxId,
        name: INBOX_FOLDER_NAME,
        spaceId: GENERAL_SPACE_ID,
        sortOrder: -1,
      },
    ];
  }

  const folderIdsInSpace = new Map<string, Set<string>>();
  for (const folder of folders) {
    const set = folderIdsInSpace.get(folder.spaceId) ?? new Set<string>();
    set.add(folder.id);
    folderIdsInSpace.set(folder.spaceId, set);
  }

  const feeds = blob.feeds.map((feed) => {
    const spaceId = feed.spaceId || COMPUTING_SPACE_ID;
    const allowed = folderIdsInSpace.get(spaceId) ?? new Set<string>();
    const inboxId = inboxFolderId(spaceId);
    const mapped = getFeedFolderIdsFromLegacy(feed)
      .map((id) => (id === LEGACY_INBOX_FOLDER_ID ? computingInboxId : id))
      .filter((id) => allowed.has(id) || id === inboxId);
    return {
      ...feed,
      spaceId,
      folderIds: normalizeFeedFolderIds(mapped, spaceId),
    };
  });

  const tags = blob.tags.map((tag) => ({
    ...tag,
    spaceId: tag.spaceId || COMPUTING_SPACE_ID,
  }));

  const settings: Settings = {
    ...blob.settings,
    activeSpaceId: resolveActiveSpaceId(blob.settings.activeSpaceId, spaces),
    seededGeneral: blob.settings.seededGeneral === true,
  };

  return {
    ...blob,
    spaces,
    folders,
    feeds,
    tags,
    settings,
  };
}

export function migrateBlob(raw: unknown): PersistedBlob {
  if (!raw || typeof raw !== 'object') {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      spaces: getDefaultSpaces(),
      feeds: [],
      items: [],
      folders: [
        {
          id: inboxFolderId(COMPUTING_SPACE_ID),
          name: INBOX_FOLDER_NAME,
          spaceId: COMPUTING_SPACE_ID,
          sortOrder: -1,
        },
        {
          id: inboxFolderId(GENERAL_SPACE_ID),
          name: INBOX_FOLDER_NAME,
          spaceId: GENERAL_SPACE_ID,
          sortOrder: -1,
        },
      ],
      tags: [],
      settings: { ...DEFAULT_SETTINGS },
    };
  }

  const blob = raw as Partial<PersistedBlob>;
  const version =
    typeof blob.schemaVersion === 'number' ? blob.schemaVersion : 0;
  const settings = normalizeSettings(blob.settings);

  const feeds = Array.isArray(blob.feeds)
    ? blob.feeds
        .map((f) => normalizeFeed(f, settings.allowHttpFeeds))
        .filter((f): f is FeedSource => f !== null)
    : [];
  const items = Array.isArray(blob.items)
    ? blob.items.map(normalizeItem).filter((i): i is FeedItem => i !== null)
    : [];
  const folders = Array.isArray(blob.folders)
    ? blob.folders.map(normalizeFolder).filter((f): f is Folder => f !== null)
    : [];
  const tags = Array.isArray(blob.tags)
    ? blob.tags.map(normalizeTag).filter((t): t is Tag => t !== null)
    : [];
  const spaces = Array.isArray(blob.spaces)
    ? blob.spaces.map(normalizeSpace).filter((s): s is Space => s !== null)
    : [];

  let migrated: PersistedBlob = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    spaces,
    feeds,
    items: sortItemsByPublishedDesc(items),
    folders,
    tags,
    settings,
  };

  if (version < 2) {
    migrated = mergeEngBlogsIntoBlob(migrated);
  }

  if (version < 3) {
    migrated = {
      ...migrated,
      folders: migrated.folders.map((f) =>
        isInboxFolderId(f.id) || f.id === LEGACY_INBOX_FOLDER_ID
          ? { ...f, name: INBOX_FOLDER_NAME }
          : f
      ),
    };
  }

  if (version < 4) {
    migrated = dedupeHnAndItems(migrated);
  }

  if (version < 5) {
    migrated = {
      ...migrated,
      feeds: migrated.feeds.map((feed) => ({
        ...feed,
        folderIds: normalizeFeedFolderIds(
          getFeedFolderIdsFromLegacy(feed),
          feed.spaceId
        ),
      })),
    };
  }

  if (version < 6) {
    migrated = removeBrokenHnAiFeed(migrated);
  }

  // Always ensure spaces/inboxes exist (v7 migration + repair of incomplete blobs).
  migrated = migrateToSpaces(migrated);
  migrated = {
    ...migrated,
    feeds: rewriteKnownBrokenFeedUrls(migrated.feeds),
  };

  return migrated;
}

/** Upstream emptied or moved; keep installs working without re-seed. */
const BROKEN_FEED_URL_REWRITES: Record<string, string> = {
  'https://oglobo.globo.com/rss.xml': 'https://pox.globo.com/rss/oglobo/',
  'https://oglobo.globo.com/rss/oglobo': 'https://pox.globo.com/rss/oglobo/',
  'https://oglobo.globo.com/rss/oglobo/': 'https://pox.globo.com/rss/oglobo/',
  'https://gmgall.github.io/feeds/bbc-brasil-internacional.xml':
    'https://feeds.bbci.co.uk/portuguese/rss.xml',
};

function rewriteKnownBrokenFeedUrls(feeds: FeedSource[]): FeedSource[] {
  return feeds.map((feed) => {
    const next = BROKEN_FEED_URL_REWRITES[feed.url];
    if (!next || next === feed.url) return feed;
    return {
      ...feed,
      url: next,
      etag: undefined,
      lastModified: undefined,
      lastError: undefined,
    };
  });
}

function getFeedFolderIdsFromLegacy(
  feed: FeedSource & { folderId?: string }
): string[] {
  if (feed.folderIds?.length) return feed.folderIds;
  if (typeof feed.folderId === 'string') return [feed.folderId];
  return [inboxFolderId(feed.spaceId || COMPUTING_SPACE_ID)];
}
