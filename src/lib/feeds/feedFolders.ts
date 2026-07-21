import type { FeedSource, Folder } from '@/types';
import { COMPUTING_SPACE_ID } from '@/lib/spaces';

export const LEGACY_INBOX_FOLDER_ID = 'inbox';

export function inboxFolderId(spaceId: string): string {
  return `inbox:${spaceId}`;
}

/** Default inbox after schema v7 migration (computing space). */
export const INBOX_FOLDER_ID = inboxFolderId(COMPUTING_SPACE_ID);

export function isInboxFolderId(folderId: string): boolean {
  return folderId === LEGACY_INBOX_FOLDER_ID || folderId.startsWith('inbox:');
}

export function normalizeFeedFolderIds(
  folderIds: string[],
  spaceId: string = COMPUTING_SPACE_ID,
): string[] {
  const unique = [
    ...new Set(
      folderIds
        .filter(Boolean)
        .map((id) =>
          id === LEGACY_INBOX_FOLDER_ID ? inboxFolderId(spaceId) : id,
        ),
    ),
  ];
  return unique.length > 0 ? unique : [inboxFolderId(spaceId)];
}

export function getFeedFolderIds(feed: FeedSource): string[] {
  if (feed.folderIds.length > 0) {
    return normalizeFeedFolderIds(feed.folderIds, feed.spaceId);
  }
  return [inboxFolderId(feed.spaceId)];
}

export function feedInFolder(feed: FeedSource, folderId: string): boolean {
  return getFeedFolderIds(feed).includes(folderId);
}

export function addFeedToFolder(
  feed: FeedSource,
  folderId: string,
): FeedSource {
  const ids = getFeedFolderIds(feed);
  if (ids.includes(folderId)) return feed;
  return {
    ...feed,
    folderIds: normalizeFeedFolderIds([...ids, folderId], feed.spaceId),
  };
}

export function removeFeedFromFolder(
  feed: FeedSource,
  folderId: string,
): FeedSource {
  const ids = getFeedFolderIds(feed).filter((id) => id !== folderId);
  return {
    ...feed,
    folderIds: normalizeFeedFolderIds(ids, feed.spaceId),
  };
}

export function toggleFeedFolderMembership(
  feed: FeedSource,
  folderId: string,
): FeedSource | null {
  if (feedInFolder(feed, folderId)) {
    const ids = getFeedFolderIds(feed);
    if (ids.length <= 1) return null;
    return removeFeedFromFolder(feed, folderId);
  }
  return addFeedToFolder(feed, folderId);
}

export function formatFeedFolderNames(
  feed: FeedSource,
  folders: Folder[],
): string {
  const byId = new Map(folders.map((f) => [f.id, f.name]));
  return getFeedFolderIds(feed)
    .map((id) => byId.get(id) ?? '—')
    .join(' · ');
}

export function retentionDaysForFeed(
  feed: FeedSource,
  folders: { id: string; retentionDays?: number }[],
  globalRetentionDays: number,
): number {
  let days = globalRetentionDays;
  for (const folderId of getFeedFolderIds(feed)) {
    const folder = folders.find((f) => f.id === folderId);
    if (folder?.retentionDays != null) {
      days = Math.min(days, folder.retentionDays);
    }
  }
  return days;
}
