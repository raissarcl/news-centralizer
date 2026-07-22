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
import { sortItemsByPublishedDesc } from '../lib/items/sortItems';
import {
  inboxFolderId,
  isInboxFolderId,
  LEGACY_INBOX_FOLDER_ID,
  normalizeFeedFolderIds,
} from '../lib/feeds/feedFolders';
import {
  COMPUTING_SPACE_ID,
  GENERAL_SPACE_ID,
  getDefaultSpaces,
} from '../lib/spaces';
import { INBOX_FOLDER_NAME, mergeMissingSeedFeeds } from '../lib/opml/seedFromOpml';
import { DEFAULT_GENERAL_FEEDS_OPML } from '../data/defaultGeneralFeedsOpml';
import {
  applyCatalogRepairs,
  dedupeHnAndItems,
  getFeedFolderIdsFromLegacy,
  mergeEngBlogsIntoBlob,
  ensureHnFrontpageFeed,
  removeBrokenHnAiFeed,
  removeRetiredCatalogFeeds,
} from './catalogRepairs';

export {
  dedupeHnAndItems,
  mergeEngBlogsIntoBlob,
  removeBrokenHnAiFeed,
} from './catalogRepairs';

function normalizeSettings(raw: Partial<Settings> | undefined): Settings {
  const merged: Settings = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  const retentionDays =
    typeof merged.retentionDays === 'number' && merged.retentionDays > 0
      ? Math.min(merged.retentionDays, 365)
      : DEFAULT_SETTINGS.retentionDays;
  return {
    theme:
      merged.theme === 'light' ||
      merged.theme === 'dark' ||
      merged.theme === 'system'
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
      typeof merged.activeSpaceId === 'string' &&
      merged.activeSpaceId.length > 0
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
    ? (x.folderIds as unknown[]).filter(
        (id): id is string => typeof id === 'string',
      )
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
      ? (x.tagIds as unknown[]).filter(
          (t): t is string => typeof t === 'string',
        )
      : [],
    enabled: x.enabled !== false,
    lastFetchedAt:
      typeof x.lastFetchedAt === 'string' ? x.lastFetchedAt : undefined,
    etag: typeof x.etag === 'string' ? x.etag : undefined,
    lastModified:
      typeof x.lastModified === 'string' ? x.lastModified : undefined,
    lastError: typeof x.lastError === 'string' ? x.lastError : undefined,
    refreshFailCount:
      typeof x.refreshFailCount === 'number' ? x.refreshFailCount : undefined,
    refreshPausedUntil:
      typeof x.refreshPausedUntil === 'string'
        ? x.refreshPausedUntil
        : undefined,
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
          : f,
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
          feed.spaceId,
        ),
      })),
    };
  }

  if (version < 6) {
    migrated = removeBrokenHnAiFeed(migrated);
  }

  if (version < 9) {
    migrated = removeRetiredCatalogFeeds(migrated);
  }

  if (version < 10) {
    migrated = ensureHnFrontpageFeed(migrated);
  }

  if (version < 11) {
    const merged = mergeMissingSeedFeeds(
      migrated.folders,
      migrated.feeds,
      DEFAULT_GENERAL_FEEDS_OPML,
      GENERAL_SPACE_ID,
      { allowHttp: migrated.settings.allowHttpFeeds },
    );
    migrated = {
      ...migrated,
      folders: merged.folders,
      feeds: merged.feeds,
      settings: {
        ...migrated.settings,
        seededGeneral: true,
      },
    };
  }

  if (version < 12) {
    const merged = mergeMissingSeedFeeds(
      migrated.folders,
      migrated.feeds,
      DEFAULT_GENERAL_FEEDS_OPML,
      GENERAL_SPACE_ID,
      { allowHttp: migrated.settings.allowHttpFeeds },
    );
    migrated = {
      ...migrated,
      folders: merged.folders,
      feeds: merged.feeds,
    };
  }

  // Always-on catalog repairs (spaces/inboxes + known broken URL rewrites).
  return applyCatalogRepairs(migrated);
}
