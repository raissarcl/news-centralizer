import type { FeedItem, FeedSource, SlimStarredItem } from '../../types';
import { normalizeItemLink } from './dedupeItems';
import { sortItemsByPublishedDesc } from './sortItems';

/** Cap persisted read keys so the map cannot grow forever. */
export const MAX_READ_KEYS = 4000;

function sortByPublishedDesc<T extends { publishedAt: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export function spaceLinkKey(spaceId: string, link: string): string | null {
  const linkKey = normalizeItemLink(link);
  if (!linkKey) return null;
  return `${spaceId}::${linkKey}`;
}

export function toSlimStarred(item: FeedItem): SlimStarredItem {
  return {
    id: item.id,
    feedId: item.feedId,
    title: item.title,
    link: item.link,
    publishedAt: item.publishedAt,
    imageUrl: item.imageUrl,
  };
}

export function slimToFeedItem(slim: SlimStarredItem, read = false): FeedItem {
  return {
    id: slim.id,
    feedId: slim.feedId,
    title: slim.title,
    link: slim.link,
    imageUrl: slim.imageUrl,
    publishedAt: slim.publishedAt,
    read,
    starred: true,
  };
}

export function normalizeReadKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' || !entry.trim()) continue;
    const key = entry.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return capReadKeys(out);
}

export function normalizeStarredItems(raw: unknown): SlimStarredItem[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, SlimStarredItem>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const x = entry as Record<string, unknown>;
    if (
      typeof x.id !== 'string' ||
      typeof x.feedId !== 'string' ||
      typeof x.title !== 'string' ||
      typeof x.link !== 'string'
    ) {
      continue;
    }
    byId.set(x.id, {
      id: x.id,
      feedId: x.feedId,
      title: x.title,
      link: x.link,
      publishedAt:
        typeof x.publishedAt === 'string'
          ? x.publishedAt
          : new Date().toISOString(),
      imageUrl: typeof x.imageUrl === 'string' ? x.imageUrl : undefined,
    });
  }
  return sortByPublishedDesc([...byId.values()]);
}

export function capReadKeys(keys: string[]): string[] {
  if (keys.length <= MAX_READ_KEYS) return keys;
  return keys.slice(keys.length - MAX_READ_KEYS);
}

/**
 * Build persisted marks from a legacy/full items snapshot (and optional
 * already-extracted marks).
 */
export function extractMarksFromItems(
  items: FeedItem[],
  feeds: FeedSource[],
  existingReadKeys: string[] = [],
  existingStarred: SlimStarredItem[] = [],
): { readKeys: string[]; starredItems: SlimStarredItem[] } {
  const feedSpace = new Map(feeds.map((f) => [f.id, f.spaceId]));
  const readSet = new Set(existingReadKeys);
  const starredById = new Map(existingStarred.map((s) => [s.id, s]));

  for (const item of items) {
    const spaceId = feedSpace.get(item.feedId);
    if (item.read && spaceId) {
      const key = spaceLinkKey(spaceId, item.link);
      if (key) readSet.add(key);
    }
    if (item.starred) {
      starredById.set(item.id, toSlimStarred(item));
    }
  }

  return {
    readKeys: capReadKeys([...readSet]),
    starredItems: sortByPublishedDesc([...starredById.values()]),
  };
}

/** Keep only read keys that still appear in the in-memory timeline. */
export function pruneReadKeysToItems(
  readKeys: string[],
  items: FeedItem[],
  feeds: FeedSource[],
): string[] {
  if (readKeys.length === 0) return [];
  const feedSpace = new Map(feeds.map((f) => [f.id, f.spaceId]));
  const present = new Set<string>();
  for (const item of items) {
    const spaceId = feedSpace.get(item.feedId);
    if (!spaceId) continue;
    const key = spaceLinkKey(spaceId, item.link);
    if (key) present.add(key);
  }
  return readKeys.filter((k) => present.has(k));
}

export function addReadKey(
  readKeys: string[],
  spaceId: string,
  link: string,
): string[] {
  const key = spaceLinkKey(spaceId, link);
  if (!key || readKeys.includes(key)) return readKeys;
  return capReadKeys([...readKeys, key]);
}

export function removeReadKey(
  readKeys: string[],
  spaceId: string,
  link: string,
): string[] {
  const key = spaceLinkKey(spaceId, link);
  if (!key) return readKeys;
  return readKeys.filter((k) => k !== key);
}

export function upsertStarred(
  starredItems: SlimStarredItem[],
  item: FeedItem,
): SlimStarredItem[] {
  const slim = toSlimStarred(item);
  const without = starredItems.filter((s) => s.id !== item.id);
  return sortByPublishedDesc([...without, slim]);
}

export function removeStarred(
  starredItems: SlimStarredItem[],
  itemId: string,
): SlimStarredItem[] {
  return starredItems.filter((s) => s.id !== itemId);
}

/** Hydrate timeline with starred rows (read flag from readKeys). */
export function hydrateItemsFromMarks(
  starredItems: SlimStarredItem[],
  readKeys: string[],
  feeds: FeedSource[],
): FeedItem[] {
  const feedSpace = new Map(feeds.map((f) => [f.id, f.spaceId]));
  const readSet = new Set(readKeys);
  const items = starredItems.map((slim) => {
    const spaceId = feedSpace.get(slim.feedId);
    const key = spaceId ? spaceLinkKey(spaceId, slim.link) : null;
    return slimToFeedItem(slim, key != null && readSet.has(key));
  });
  return sortItemsByPublishedDesc(items);
}
