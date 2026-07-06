import { t } from '@/lib/i18n';
import type { FeedSource, Tag, TimelinePeriod } from '@/types';

export function periodLabel(period: TimelinePeriod): string {
  if (period === 'all') return t.periodAll;
  if (period === 'today') return t.periodToday;
  if (period === '24h') return t.period24h;
  if (period === '7d') return t.period7d;
  if (period === '30d') return t.period30d;
  return t.period90d;
}

export function buildActiveFilterSummary(input: {
  timelinePeriod: TimelinePeriod;
  selectedFolderId?: string | null;
  selectedTagId?: string | null;
  selectedFeedIds?: string[];
  folders?: Array<{ id: string; name: string }>;
  tags?: Tag[];
  feeds?: FeedSource[];
}): string {
  const parts: string[] = [];
  if (input.timelinePeriod !== 'all') {
    parts.push(periodLabel(input.timelinePeriod));
  }
  if (input.selectedFolderId && input.folders) {
    const folder = input.folders.find((f) => f.id === input.selectedFolderId);
    if (folder) parts.push(folder.name);
  }
  if (input.selectedTagId && input.tags) {
    const tag = input.tags.find((tg) => tg.id === input.selectedTagId);
    if (tag) parts.push(tag.name);
  }
  if (input.selectedFeedIds?.length && input.feeds) {
    for (const feedId of input.selectedFeedIds) {
      const feed = input.feeds.find((f) => f.id === feedId);
      if (feed) parts.push(feed.title);
    }
  }
  return parts.join(' · ');
}
