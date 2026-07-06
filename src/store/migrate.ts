import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  type FeedItem,
  type FeedSource,
  type Folder,
  type PersistedBlob,
  type Settings,
  type Tag,
} from '../types';
import { validateFeedUrl } from '../lib/security/urls';
import { ENGBLOGS_STARTER_OPML } from '../data/engblogsStarter';
import { flattenOpmlFeeds, parseOpml } from '../lib/opml';
import { createId } from '../lib/id';
import { sortItemsByPublishedDesc } from '../lib/items/sortItems';
import { dedupeItemsByLink, normalizeFeedUrl, normalizeItemLink } from '../lib/items/dedupeItems';
import { normalizeFeedFolderIds } from '../lib/feeds/feedFolders';

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
  };
}

function normalizeFeed(raw: unknown, allowHttp: boolean): FeedSource | null {
  if (!raw || typeof raw !== 'object') return null;
  const x = raw as Record<string, unknown>;
  if (typeof x.id !== 'string' || typeof x.url !== 'string') return null;
  if (!validateFeedUrl(x.url, { allowHttp }).ok) return null;

  const rawFolderIds = Array.isArray(x.folderIds)
    ? (x.folderIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : typeof x.folderId === 'string'
      ? [x.folderId]
      : ['inbox'];

  return {
    id: x.id,
    title: typeof x.title === 'string' ? x.title : x.url,
    url: x.url,
    siteUrl: typeof x.siteUrl === 'string' ? x.siteUrl : undefined,
    favicon: typeof x.favicon === 'string' ? x.favicon : undefined,
    folderIds: normalizeFeedFolderIds(rawFolderIds),
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
  return {
    id: x.id,
    name: x.name,
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
  const folderIdByName = new Map(folders.map((f) => [f.name, f.id]));
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
      folderIds: normalizeFeedFolderIds([folderId]),
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

export function migrateBlob(raw: unknown): PersistedBlob {
  if (!raw || typeof raw !== 'object') {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      feeds: [],
      items: [],
      folders: [],
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

  let migrated: PersistedBlob = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
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
        f.id === 'inbox' ? { ...f, name: 'Caixa de entrada' } : f
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
        folderIds: normalizeFeedFolderIds(getFeedFolderIdsFromLegacy(feed)),
      })),
    };
  }

  if (version < 6) {
    migrated = removeBrokenHnAiFeed(migrated);
  }

  return migrated;
}

function getFeedFolderIdsFromLegacy(
  feed: FeedSource & { folderId?: string }
): string[] {
  if (feed.folderIds?.length) return feed.folderIds;
  if (typeof feed.folderId === 'string') return [feed.folderId];
  return ['inbox'];
}
