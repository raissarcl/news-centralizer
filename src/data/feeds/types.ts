export type FeedCatalogEntry = {
  title: string;
  url: string;
  siteUrl?: string;
  /** When omitted, Papers folders default to disabled. */
  enabled?: boolean;
};

export type FeedCatalogFolder = {
  name: string;
  /** Optional folder-level retention (e.g. Papers = 7). */
  retentionDays?: number;
  feeds: FeedCatalogEntry[];
};

export type FeedCatalog = {
  folders: FeedCatalogFolder[];
};
