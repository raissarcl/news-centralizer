import type { FeedItem } from '@/types';
import { sortItemsByPublishedDesc } from './sortItems';

export function normalizeItemLink(link: string): string {
  const trimmed = link.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    url.pathname = path;
    return url.toString();
  } catch {
    return trimmed.toLowerCase();
  }
}

function mergeDuplicateItems(newer: FeedItem, older: FeedItem): FeedItem {
  return {
    ...newer,
    read: newer.read && older.read,
    starred: newer.starred || older.starred,
    imageUrl: newer.imageUrl ?? older.imageUrl,
    summary: newer.summary ?? older.summary,
  };
}

/** Keeps one item per normalized link (newest publishedAt wins). */
export function dedupeItemsByLink(items: FeedItem[]): FeedItem[] {
  const sorted = sortItemsByPublishedDesc(items);
  const byLink = new Map<string, FeedItem>();

  for (const item of sorted) {
    const key = normalizeItemLink(item.link);
    if (!key) {
      byLink.set(item.id, item);
      continue;
    }
    const prev = byLink.get(key);
    if (!prev) {
      byLink.set(key, item);
    } else {
      byLink.set(key, mergeDuplicateItems(prev, item));
    }
  }

  return sortItemsByPublishedDesc([...byLink.values()]);
}

export function normalizeFeedUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    parsed.pathname = path;
    return parsed.toString();
  } catch {
    return trimmed.toLowerCase();
  }
}
