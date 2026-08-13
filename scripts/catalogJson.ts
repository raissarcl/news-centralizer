import type { FeedCatalog } from '../src/data/feeds/types';

export type CatalogFeedFlat = {
  title: string;
  url: string;
  siteUrl?: string;
  folderName: string;
  enabled?: boolean;
};

export function flattenCatalogFeeds(catalog: FeedCatalog): CatalogFeedFlat[] {
  const out: CatalogFeedFlat[] = [];
  for (const folder of catalog.folders) {
    for (const feed of folder.feeds) {
      out.push({
        title: feed.title,
        url: feed.url,
        siteUrl: feed.siteUrl,
        folderName: folder.name,
        enabled: feed.enabled,
      });
    }
  }
  return out;
}

export function pruneCatalogUrls(
  catalog: FeedCatalog,
  urlsToRemove: Set<string>,
): FeedCatalog {
  return {
    folders: catalog.folders
      .map((folder) => ({
        ...folder,
        feeds: folder.feeds.filter((f) => !urlsToRemove.has(f.url)),
      }))
      .filter((folder) => folder.feeds.length > 0),
  };
}
