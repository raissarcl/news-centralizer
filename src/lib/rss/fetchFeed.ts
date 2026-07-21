import { subDays, isAfter, parseISO } from 'date-fns';
import type { FeedSource, FeedItem } from '@/types';
import { itemIdFromEntry } from '@/lib/id';
import { retentionDaysForFeed } from '@/lib/feeds/feedFolders';
import { safeFetch } from '@/lib/security/safeFetch';
import { isPublishedAtDisplayable } from '@/lib/items/publishDate';
import { parseFeedXml } from './parseFeedXml';

export type ParsedFeedEntry = {
  id: string;
  title: string;
  link: string;
  summary?: string;
  imageUrl?: string;
  publishedAt: string;
};

export type FetchFeedResult = {
  notModified: boolean;
  entries: ParsedFeedEntry[];
  etag?: string;
  lastModified?: string;
  error?: string;
};

export type FetchFeedOptions = {
  allowHttp?: boolean;
};

export async function fetchFeed(
  source: FeedSource,
  options: FetchFeedOptions = {},
): Promise<FetchFeedResult> {
  const allowHttp = options.allowHttp === true;
  const headers: Record<string, string> = {
    Accept:
      'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
    'User-Agent': 'NewsCentralizer/1.0',
  };
  if (source.etag) headers['If-None-Match'] = source.etag;
  if (source.lastModified) headers['If-Modified-Since'] = source.lastModified;

  const result = await safeFetch(source.url, {
    headers,
    validateOptions: { allowHttp },
  });

  if (!result.ok) {
    return {
      notModified: false,
      entries: [],
      error: result.error,
    };
  }

  if (result.status === 304) {
    return {
      notModified: true,
      entries: [],
      etag: result.etag ?? source.etag,
      lastModified: result.lastModified ?? source.lastModified,
    };
  }

  const rawEntries = parseFeedXml(result.text);
  const entries: ParsedFeedEntry[] = rawEntries
    .filter((entry) => isPublishedAtDisplayable(entry.publishedAt))
    .map((entry) => ({
      id: itemIdFromEntry(source.id, entry.guid, entry.link),
      title: entry.title,
      link: entry.link,
      summary: entry.summary,
      imageUrl: entry.imageUrl,
      publishedAt: entry.publishedAt,
    }));

  return {
    notModified: false,
    entries,
    etag: result.etag,
    lastModified: result.lastModified,
    error: entries.length === 0 ? 'Feed vazio após parse' : undefined,
  };
}

export function applyRetention(
  items: FeedItem[],
  retentionDays: number,
  feeds: FeedSource[],
  folders: { id: string; retentionDays?: number }[],
): FeedItem[] {
  const feedById = new Map(feeds.map((f) => [f.id, f]));

  return items.filter((item) => {
    if (!isPublishedAtDisplayable(item.publishedAt)) return false;
    const feed = feedById.get(item.feedId);
    if (!feed) return true;
    const days = retentionDaysForFeed(feed, folders, retentionDays);
    const cutoff = subDays(new Date(), days);
    try {
      return isAfter(parseISO(item.publishedAt), cutoff);
    } catch {
      return true;
    }
  });
}

export const REFRESH_CONCURRENCY = 8;

export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}
