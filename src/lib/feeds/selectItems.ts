import { parseISO, startOfDay, subDays, subHours } from 'date-fns';
import type {
  FeedItem,
  FeedSource,
  TimelineFilter,
  TimelinePeriod,
} from '@/types';
import { sortItemsByPublishedDesc } from '@/lib/items/sortItems';
import { dedupeItemsByLink } from '@/lib/items/dedupeItems';
import { isPublishedAtDisplayable } from '@/lib/items/publishDate';
import { feedInFolder } from '@/lib/feeds/feedFolders';

export function periodCutoff(period: TimelinePeriod): Date | null {
  if (period === 'all') return null;
  if (period === 'today') return startOfDay(new Date());
  if (period === '24h') return subHours(new Date(), 24);
  if (period === '7d') return subDays(new Date(), 7);
  if (period === '30d') return subDays(new Date(), 30);
  return subDays(new Date(), 90);
}

export function selectVisibleItems(state: {
  items: FeedItem[];
  feeds: FeedSource[];
  timelineFilter: TimelineFilter;
  timelinePeriod: TimelinePeriod;
  searchQuery: string;
  selectedTagId: string | null;
  selectedFolderId: string | null;
  selectedFeedIds?: string[];
  spaceId?: string | null;
}): FeedItem[] {
  const feedById = new Map(state.feeds.map((f) => [f.id, f]));
  const q = state.searchQuery.trim().toLowerCase();
  const cutoff = periodCutoff(state.timelinePeriod);

  const filtered = state.items.filter((item) => {
    if (!isPublishedAtDisplayable(item.publishedAt)) return false;
    const feed = feedById.get(item.feedId);
    if (!feed || !feed.enabled) return false;
    if (state.spaceId && feed.spaceId !== state.spaceId) return false;
    if (state.selectedFolderId && !feedInFolder(feed, state.selectedFolderId)) {
      return false;
    }
    if (state.selectedTagId && !feed.tagIds.includes(state.selectedTagId)) {
      return false;
    }
    if (
      state.selectedFeedIds?.length &&
      !state.selectedFeedIds.includes(item.feedId)
    ) {
      return false;
    }
    if (state.timelineFilter === 'unread' && item.read) return false;
    if (state.timelineFilter === 'read' && !item.read) return false;
    if (state.timelineFilter === 'starred' && !item.starred) return false;
    if (cutoff) {
      try {
        if (parseISO(item.publishedAt) < cutoff) return false;
      } catch {
        return false;
      }
    }
    if (q) {
      const haystack = [item.title, item.summary ?? '', feed.title]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return dedupeItemsByLink(filtered);
}

export function filterItemsForFolder(
  items: FeedItem[],
  folderId: string,
  feeds: FeedSource[],
): FeedItem[] {
  const feedIds = new Set(
    feeds
      .filter((f) => feedInFolder(f, folderId) && f.enabled)
      .map((f) => f.id),
  );
  return dedupeItemsByLink(
    items.filter(
      (i) => feedIds.has(i.feedId) && isPublishedAtDisplayable(i.publishedAt),
    ),
  );
}

export function filterItemsForFeed(
  items: FeedItem[],
  feedId: string,
): FeedItem[] {
  return sortItemsByPublishedDesc(
    items.filter(
      (i) => i.feedId === feedId && isPublishedAtDisplayable(i.publishedAt),
    ),
  );
}
