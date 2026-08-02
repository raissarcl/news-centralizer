import { normalizeFeedUrl } from '../items/dedupeItems';

export const GOOGLE_DEVELOPERS_BLOG_OLD_URL = normalizeFeedUrl(
  'https://developers.googleblog.com/feeds/posts/default',
);
export const GOOGLE_DEVELOPERS_BLOG_URL =
  'https://blog.google/technology/developers/rss/';

/** Legacy seed URLs that count as the same catalog feed. */
export function feedUrlAliases(normalizedUrl: string): string[] {
  const current = normalizeFeedUrl(GOOGLE_DEVELOPERS_BLOG_URL);
  if (
    normalizedUrl === current ||
    normalizedUrl === GOOGLE_DEVELOPERS_BLOG_OLD_URL
  ) {
    return [current, GOOGLE_DEVELOPERS_BLOG_OLD_URL];
  }
  return [normalizedUrl];
}
