export function faviconUrlForFeed(
  siteUrl?: string,
  feedUrl?: string,
): string | undefined {
  try {
    const raw = siteUrl ?? feedUrl;
    if (!raw) return undefined;
    const host = new URL(raw).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
  } catch {
    return undefined;
  }
}

export function resolveFeedFavicon(feed: {
  siteUrl?: string;
  url: string;
  favicon?: string;
}): string | undefined {
  return feed.favicon ?? faviconUrlForFeed(feed.siteUrl, feed.url);
}
