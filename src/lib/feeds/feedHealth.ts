import type { FeedSource } from '@/types';

export type FeedHealthSummary = {
  errors: number;
  paused: number;
};

export function computeFeedHealth(feeds: FeedSource[]): FeedHealthSummary {
  const now = Date.now();
  let errors = 0;
  let paused = 0;

  for (const feed of feeds) {
    if (feed.lastError) errors += 1;
    if (
      feed.refreshPausedUntil &&
      new Date(feed.refreshPausedUntil).getTime() > now
    ) {
      paused += 1;
    }
  }

  return { errors, paused };
}

export function isFeedPausedNow(feed: FeedSource): boolean {
  if (!feed.refreshPausedUntil) return false;
  return new Date(feed.refreshPausedUntil).getTime() > Date.now();
}
