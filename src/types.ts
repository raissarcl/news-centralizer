export type ThemeMode = 'system' | 'light' | 'dark';

export type Space = {
  id: string;
  name: string;
  icon?: string;
  sortOrder: number;
};

export type FeedSource = {
  id: string;
  title: string;
  url: string;
  siteUrl?: string;
  favicon?: string;
  spaceId: string;
  folderIds: string[];
  tagIds: string[];
  enabled: boolean;
  lastFetchedAt?: string;
  etag?: string;
  lastModified?: string;
  lastError?: string;
  refreshFailCount?: number;
  refreshPausedUntil?: string;
};

export type FeedItem = {
  id: string;
  feedId: string;
  title: string;
  link: string;
  summary?: string;
  imageUrl?: string;
  publishedAt: string;
  read: boolean;
  starred: boolean;
};

/** Compact starred row kept across sessions (timeline itself is not persisted). */
export type SlimStarredItem = {
  id: string;
  feedId: string;
  title: string;
  link: string;
  publishedAt: string;
  imageUrl?: string;
};

export type Folder = {
  id: string;
  name: string;
  spaceId: string;
  icon?: string;
  sortOrder: number;
  retentionDays?: number;
};

export type Tag = {
  id: string;
  name: string;
  spaceId: string;
  color?: string;
};

export type Settings = {
  theme: ThemeMode;
  locale: 'pt-BR' | 'en-US';
  retentionDays: number;
  refreshOnOpen: boolean;
  notifyOnNewItems: boolean;
  allowHttpFeeds: boolean;
  rssHubAcknowledged: boolean;
  lastExportAt: string | null;
  seeded: boolean;
  seededGeneral: boolean;
  activeSpaceId: string;
  /** Normalized feed URLs the user deleted; seed merges must not restore them. */
  removedFeedUrls: string[];
  /** Normalized feed URLs the user disabled; hydrate must not re-enable them. */
  disabledFeedUrls: string[];
};

export type PersistedBlob = {
  schemaVersion: number;
  spaces: Space[];
  feeds: FeedSource[];
  /** Always empty on save — timeline lives in memory only. Kept for backup compat. */
  items: FeedItem[];
  /** Keys `spaceId::normalizedLink` for items marked read. */
  readKeys: string[];
  /** Slim starred items so favorites survive across refreshes/restarts. */
  starredItems: SlimStarredItem[];
  folders: Folder[];
  tags: Tag[];
  settings: Settings;
};

export const CURRENT_SCHEMA_VERSION = 17;

export const DEFAULT_SETTINGS: Settings = {
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
  activeSpaceId: 'general',
  removedFeedUrls: [],
  disabledFeedUrls: [],
};

export type TimelineFilter = 'all' | 'unread' | 'read' | 'starred';
export type TimelinePeriod = 'all' | 'today' | '24h' | '7d' | '30d' | '90d';
