import { faviconUrlForFeed } from '../favicon';
import { normalizeItemLink } from '../items/dedupeItems';
import { sortItemsByPublishedDesc } from '../items/sortItems';
import {
  applyRetention,
  fetchFeed,
  mapPool,
  REFRESH_CONCURRENCY,
  type FetchFeedResult,
} from '../rss/fetchFeed';
import type { FeedItem, FeedSource, Folder } from '../../types';

export const REFRESH_FAIL_THRESHOLD = 3;
export const REFRESH_PAUSE_MS = 15 * 60 * 1000;
/** Skip refetch in refreshAll when last success is newer than this (unless force). */
export const FEED_FRESH_MS = 15 * 60 * 1000;
/** Apply UI merge every N completed feeds during refresh. */
export const REFRESH_APPLY_BATCH_SIZE = 2;

export type FeedRefreshPatch = Pick<
  FeedSource,
  | 'refreshFailCount'
  | 'refreshPausedUntil'
  | 'favicon'
  | 'lastFetchedAt'
  | 'etag'
  | 'lastModified'
  | 'lastError'
>;

export type RefreshFeedBatch = {
  feedUpdates: Map<string, FeedRefreshPatch>;
  newItems: FeedItem[];
  imagePatches: Map<string, string>;
};

export function isFeedPaused(feed: FeedSource, now = Date.now()): boolean {
  if (!feed.refreshPausedUntil) return false;
  return new Date(feed.refreshPausedUntil).getTime() > now;
}

export function isFeedFresh(feed: FeedSource, now = Date.now()): boolean {
  if (!feed.lastFetchedAt || feed.lastError) return false;
  if (isFeedPaused(feed, now)) return false;
  const fetchedAt = new Date(feed.lastFetchedAt).getTime();
  if (Number.isNaN(fetchedAt)) return false;
  return now - fetchedAt < FEED_FRESH_MS;
}

export function refreshStateAfterFetch(
  feed: FeedSource,
  error: string | undefined,
  now = Date.now(),
): Pick<FeedSource, 'refreshFailCount' | 'refreshPausedUntil'> {
  if (!error) {
    return { refreshFailCount: 0, refreshPausedUntil: undefined };
  }
  const failCount = (feed.refreshFailCount ?? 0) + 1;
  if (failCount >= REFRESH_FAIL_THRESHOLD) {
    return {
      refreshFailCount: failCount,
      refreshPausedUntil: new Date(now + REFRESH_PAUSE_MS).toISOString(),
    };
  }
  return {
    refreshFailCount: failCount,
    refreshPausedUntil: feed.refreshPausedUntil,
  };
}

/**
 * Applies fetch results onto the latest store snapshot so concurrent
 * enable/disable/delete during refresh are not overwritten.
 */
export function applyRefreshOntoCurrent(
  currentFeeds: FeedSource[],
  currentItems: FeedItem[],
  feedUpdates: Map<string, FeedRefreshPatch>,
  newItems: FeedItem[],
  imagePatches: Map<string, string>,
  folders: Folder[],
  retentionDays: number,
): { feeds: FeedSource[]; items: FeedItem[] } {
  const nextFeeds = currentFeeds.map((f) => {
    const patch = feedUpdates.get(f.id);
    if (!patch) return f;
    return {
      ...f,
      refreshFailCount: patch.refreshFailCount,
      refreshPausedUntil: patch.refreshPausedUntil,
      favicon: f.favicon ?? patch.favicon,
      lastFetchedAt: patch.lastFetchedAt,
      etag: patch.etag,
      lastModified: patch.lastModified,
      lastError: patch.lastError,
    };
  });
  const feedIds = new Set(nextFeeds.map((f) => f.id));
  const byId = new Map(currentItems.map((i) => [i.id, i]));

  for (const [id, imageUrl] of imagePatches) {
    const prev = byId.get(id);
    if (prev && !prev.imageUrl) {
      byId.set(id, { ...prev, imageUrl });
    }
  }
  for (const item of newItems) {
    if (!feedIds.has(item.feedId)) continue;
    if (!byId.has(item.id)) byId.set(item.id, item);
  }

  let nextItems = sortItemsByPublishedDesc([...byId.values()]);
  nextItems = applyRetention(nextItems, retentionDays, nextFeeds, folders);
  return { feeds: nextFeeds, items: nextItems };
}

export type MergeRefreshOptions = {
  allowHttp: boolean;
  onProgress?: (done: number, total: number) => void;
  /** Called with completed feed patches so the UI can merge incrementally. */
  onFeedBatch?: (batch: RefreshFeedBatch) => void;
  fetchFeedFn?: (
    source: FeedSource,
    options?: { allowHttp?: boolean },
  ) => Promise<FetchFeedResult>;
  now?: number;
};

export async function mergeRefreshResults(
  allFeeds: FeedSource[],
  enabledFeeds: FeedSource[],
  existingItems: FeedItem[],
  options: MergeRefreshOptions,
): Promise<{
  feedUpdates: Map<string, FeedRefreshPatch>;
  newItems: FeedItem[];
  imagePatches: Map<string, string>;
  newCountBySpace: Record<string, number>;
  newHeadlinesBySpace: Record<string, string[]>;
}> {
  const {
    allowHttp,
    onProgress,
    onFeedBatch,
    fetchFeedFn = fetchFeed,
    now = Date.now(),
  } = options;
  let done = 0;
  const total = enabledFeeds.length;
  const feedById = new Map(allFeeds.map((f) => [f.id, f]));
  const existingById = new Map(existingItems.map((i) => [i.id, i]));
  // Dedupe links within the same space only — allows the same story in both spaces.
  const existingBySpaceLink = new Map<string, FeedItem>();
  for (const item of existingItems) {
    const linkKey = normalizeItemLink(item.link);
    if (!linkKey) continue;
    const spaceId = feedById.get(item.feedId)?.spaceId;
    if (!spaceId) continue;
    existingBySpaceLink.set(`${spaceId}::${linkKey}`, item);
  }
  const feedUpdates = new Map<string, FeedRefreshPatch>();
  const newItems: FeedItem[] = [];
  const imagePatches = new Map<string, string>();
  const newCountBySpace: Record<string, number> = {};
  const newHeadlinesBySpace: Record<string, string[]> = {};

  let batchUpdates = new Map<string, FeedRefreshPatch>();
  let batchNewItems: FeedItem[] = [];
  let batchImagePatches = new Map<string, string>();
  let batchCount = 0;

  const flushBatch = () => {
    if (!onFeedBatch) {
      batchUpdates = new Map();
      batchNewItems = [];
      batchImagePatches = new Map();
      batchCount = 0;
      return;
    }
    if (
      batchUpdates.size === 0 &&
      batchNewItems.length === 0 &&
      batchImagePatches.size === 0
    ) {
      batchCount = 0;
      return;
    }
    onFeedBatch({
      feedUpdates: batchUpdates,
      newItems: batchNewItems,
      imagePatches: batchImagePatches,
    });
    batchUpdates = new Map();
    batchNewItems = [];
    batchImagePatches = new Map();
    batchCount = 0;
  };

  await mapPool(enabledFeeds, REFRESH_CONCURRENCY, async (feed) => {
    if (isFeedPaused(feed, now)) {
      done += 1;
      onProgress?.(done, total);
      return;
    }

    const result = await fetchFeedFn(feed, { allowHttp });
    done += 1;
    onProgress?.(done, total);

    const refreshState = refreshStateAfterFetch(feed, result.error, now);
    const patch: FeedRefreshPatch = {
      ...refreshState,
      favicon: feed.favicon ?? faviconUrlForFeed(feed.siteUrl, feed.url),
      lastFetchedAt: new Date(now).toISOString(),
      etag: result.etag ?? feed.etag,
      lastModified: result.lastModified ?? feed.lastModified,
      lastError: result.error,
    };
    feedUpdates.set(feed.id, patch);
    batchUpdates.set(feed.id, patch);

    const feedNewItems: FeedItem[] = [];
    const feedImagePatches = new Map<string, string>();

    if (!result.notModified) {
      for (const entry of result.entries) {
        const linkKey = normalizeItemLink(entry.link);
        if (linkKey) {
          const spaceLinkKey = `${feed.spaceId}::${linkKey}`;
          const dupe = existingBySpaceLink.get(spaceLinkKey);
          if (dupe) {
            const prev = existingById.get(dupe.id);
            if (prev && !prev.imageUrl && entry.imageUrl) {
              imagePatches.set(dupe.id, entry.imageUrl);
              feedImagePatches.set(dupe.id, entry.imageUrl);
              existingById.set(dupe.id, { ...prev, imageUrl: entry.imageUrl });
            }
            continue;
          }
        }

        if (!existingById.has(entry.id)) {
          const newItem: FeedItem = {
            id: entry.id,
            feedId: feed.id,
            title: entry.title,
            link: entry.link,
            summary: entry.summary,
            imageUrl: entry.imageUrl,
            publishedAt: entry.publishedAt,
            read: false,
            starred: false,
          };
          existingById.set(entry.id, newItem);
          newItems.push(newItem);
          feedNewItems.push(newItem);
          if (linkKey) {
            existingBySpaceLink.set(`${feed.spaceId}::${linkKey}`, newItem);
          }
          newCountBySpace[feed.spaceId] =
            (newCountBySpace[feed.spaceId] ?? 0) + 1;
          const headlines = newHeadlinesBySpace[feed.spaceId] ?? [];
          if (headlines.length < 5) {
            headlines.push(entry.title);
            newHeadlinesBySpace[feed.spaceId] = headlines;
          }
        } else {
          const prev = existingById.get(entry.id)!;
          if (!prev.imageUrl && entry.imageUrl) {
            imagePatches.set(entry.id, entry.imageUrl);
            feedImagePatches.set(entry.id, entry.imageUrl);
            existingById.set(entry.id, { ...prev, imageUrl: entry.imageUrl });
          }
        }
      }
    }

    for (const item of feedNewItems) batchNewItems.push(item);
    for (const [id, url] of feedImagePatches) batchImagePatches.set(id, url);
    batchCount += 1;
    if (batchCount >= REFRESH_APPLY_BATCH_SIZE || done >= total) {
      flushBatch();
    }
  });

  flushBatch();

  return {
    feedUpdates,
    newItems,
    imagePatches,
    newCountBySpace,
    newHeadlinesBySpace,
  };
}
