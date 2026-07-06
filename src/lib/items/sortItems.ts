import type { FeedItem } from '@/types';

export function sortItemsByPublishedDesc(items: FeedItem[]): FeedItem[] {
  return [...items].sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}
