import type { FeedSource } from '../../types';
import { feedUrlAliases } from './feedUrlAliases';
import { normalizeFeedUrl } from '../items/dedupeItems';

export type SubscriptionTombstones = {
  removedFeedUrls: string[];
  disabledFeedUrls: string[];
};

export function normalizeUrlList(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of urls) {
    if (typeof entry !== 'string' || !entry.trim()) continue;
    const n = normalizeFeedUrl(entry);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function unionUrlLists(a: string[], b: string[]): string[] {
  return normalizeUrlList([...a, ...b]);
}

export function aliasesForFeedUrl(url: string): string[] {
  const n = normalizeFeedUrl(url);
  if (!n) return [];
  return feedUrlAliases(n);
}

export function urlSetWithAliases(urls: string[]): Set<string> {
  const set = new Set<string>();
  for (const url of urls) {
    for (const alias of aliasesForFeedUrl(url)) set.add(alias);
  }
  return set;
}

function urlMatchesSet(url: string, set: Set<string>): boolean {
  return aliasesForFeedUrl(url).some((u) => set.has(u));
}

export function addUrlToList(list: string[], url: string): string[] {
  const next = unionUrlLists(list, aliasesForFeedUrl(url));
  if (next.length === list.length) return list;
  return next;
}

export function removeUrlFromList(list: string[], url: string): string[] {
  const drop = urlSetWithAliases([url]);
  if (drop.size === 0) return list;
  const next = list.filter((u) => !drop.has(normalizeFeedUrl(u)));
  return next.length === list.length ? list : next;
}

export function disabledUrlsFromFeeds(feeds: FeedSource[]): string[] {
  const urls: string[] = [];
  for (const feed of feeds) {
    if (feed.enabled) continue;
    urls.push(...aliasesForFeedUrl(feed.url));
  }
  return normalizeUrlList(urls);
}

export function partitionFeedsByEnabled(feeds: FeedSource[]): {
  active: FeedSource[];
  inactive: FeedSource[];
} {
  const active: FeedSource[] = [];
  const inactive: FeedSource[] = [];
  for (const feed of feeds) {
    if (feed.enabled) active.push(feed);
    else inactive.push(feed);
  }
  return { active, inactive };
}

/**
 * Drop tombstoned URLs, force disabled tombstones off, and collapse
 * duplicate rows for the same space + normalized URL.
 */
export function applySubscriptionIntent(
  feeds: FeedSource[],
  tombstones: SubscriptionTombstones,
): FeedSource[] {
  const removed = urlSetWithAliases(tombstones.removedFeedUrls);
  const disabled = urlSetWithAliases(tombstones.disabledFeedUrls);
  const kept =
    removed.size === 0
      ? feeds
      : feeds.filter((f) => !urlMatchesSet(f.url, removed));
  return dedupeFeedsByUrl(kept, disabled);
}

export function dedupeFeedsByUrl(
  feeds: FeedSource[],
  disabledUrls: Set<string>,
): FeedSource[] {
  const byKey = new Map<string, FeedSource>();
  for (const feed of feeds) {
    const canonical = normalizeFeedUrl(feed.url) || feed.url;
    const key = `${feed.spaceId}::${canonical}`;
    const forceDisabled =
      !feed.enabled || urlMatchesSet(feed.url, disabledUrls);
    const next = forceDisabled ? { ...feed, enabled: false } : feed;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, next);
      continue;
    }
    if (forceDisabled && existing.enabled) {
      byKey.set(key, next);
    }
  }
  return [...byKey.values()];
}
