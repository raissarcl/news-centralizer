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
  /** Retry once with fallback UA on HTTP 403. Default true for single-feed refresh. */
  retryOn403?: boolean;
};

/** Realistic mobile Chrome — many WAFs reject custom reader UAs. */
export const FEED_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';

/** Fallback UA for hosts that allowlist crawlers (e.g. Carta Capital / Cloudflare). */
export const FEED_USER_AGENT_FALLBACK =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const FEED_ACCEPT =
  'application/rss+xml, application/atom+xml, application/xml, text/xml, */*';

function httpBlockError(status: number): string {
  if (status === 403) {
    return 'Site bloqueou o acesso (Cloudflare/HTTP 403)';
  }
  if (status === 401 || status === 429) {
    return `Site bloqueou o acesso (HTTP ${status})`;
  }
  return `HTTP ${status}`;
}

export async function fetchFeed(
  source: FeedSource,
  options: FetchFeedOptions = {},
): Promise<FetchFeedResult> {
  const allowHttp = options.allowHttp === true;
  const retryOn403 = options.retryOn403 !== false;
  const baseHeaders: Record<string, string> = {
    Accept: FEED_ACCEPT,
    'User-Agent': FEED_USER_AGENT,
  };
  if (source.etag) baseHeaders['If-None-Match'] = source.etag;
  if (source.lastModified) {
    baseHeaders['If-Modified-Since'] = source.lastModified;
  }

  let result = await safeFetch(source.url, {
    headers: baseHeaders,
    validateOptions: { allowHttp },
  });

  if (retryOn403 && !result.ok && result.status === 403) {
    result = await safeFetch(source.url, {
      headers: {
        ...baseHeaders,
        'User-Agent': FEED_USER_AGENT_FALLBACK,
      },
      validateOptions: { allowHttp },
    });
  }

  if (!result.ok) {
    const error =
      typeof result.status === 'number'
        ? httpBlockError(result.status)
        : result.error;
    return {
      notModified: false,
      entries: [],
      error,
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

  let error: string | undefined;
  if (entries.length === 0) {
    const looksLikeHtml = /^\s*</.test(result.text)
      ? /<html[\s>]/i.test(result.text)
      : false;
    const hasRawItems =
      /<item[\s>]/i.test(result.text) || /<entry[\s>]/i.test(result.text);
    if (looksLikeHtml) {
      error = /just a moment|cloudflare|cf-browser-verification/i.test(
        result.text,
      )
        ? 'Site bloqueou o acesso (Cloudflare)'
        : 'Resposta HTML, não é feed RSS/Atom';
    } else if (!hasRawItems) {
      error = 'XML sem itens de feed';
    } else if (rawEntries.length === 0) {
      error = 'Não foi possível interpretar o XML do feed';
    } else {
      error = 'Itens filtrados (datas inválidas)';
    }
  }

  return {
    notModified: false,
    entries,
    etag: result.etag,
    lastModified: result.lastModified,
    error,
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

export const REFRESH_CONCURRENCY = 24;
/** Lower concurrency for background warm of the inactive space. */
export const REFRESH_BACKGROUND_CONCURRENCY = 12;

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
