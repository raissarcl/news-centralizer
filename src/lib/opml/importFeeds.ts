import {
  addFeedToFolder,
  feedInFolder,
  inboxFolderId,
  normalizeFeedFolderIds,
} from '../feeds/feedFolders';
import { createId } from '../id';
import type { FeedItem, FeedSource, Folder, Tag } from '../../types';
import type { OpmlFeedInput } from './index';
import { ensureInboxFolder, slugifyFolder } from './seedFromOpml';

export type OpmlImportState = {
  folders: Folder[];
  feeds: FeedSource[];
  items: FeedItem[];
  tags: Tag[];
};

export function applyOpmlImport(
  state: OpmlImportState,
  valid: OpmlFeedInput[],
  mode: 'merge' | 'replace',
  spaceId: string,
): OpmlImportState & { added: number } {
  if (mode === 'replace') {
    return replaceOpmlFeeds(state, valid, spaceId);
  }
  return mergeOpmlFeeds(state, valid, spaceId);
}

function replaceOpmlFeeds(
  state: OpmlImportState,
  valid: OpmlFeedInput[],
  spaceId: string,
): OpmlImportState & { added: number } {
  const folderNames = [
    ...new Set(valid.map((f) => f.folderName ?? 'Inbox').filter(Boolean)),
  ];
  const otherFolders = state.folders.filter((f) => f.spaceId !== spaceId);
  const otherFeeds = state.feeds.filter((f) => f.spaceId !== spaceId);
  const otherFeedIds = new Set(otherFeeds.map((f) => f.id));
  const folders: Folder[] = ensureInboxFolder(
    folderNames.map((name, index) => ({
      id: `${spaceId}-${slugifyFolder(name) || createId('folder')}`,
      name,
      spaceId,
      sortOrder: index,
    })),
    spaceId,
  );
  const folderIdByName = new Map(folders.map((f) => [f.name, f.id]));
  const inboxId = inboxFolderId(spaceId);
  const feeds: FeedSource[] = valid.map((input) => ({
    id: createId('feed'),
    title: input.title,
    url: input.url,
    siteUrl: input.siteUrl,
    spaceId,
    folderIds: normalizeFeedFolderIds(
      [
        folderIdByName.get(input.folderName ?? 'Inbox') ??
          folders[0]?.id ??
          inboxId,
      ],
      spaceId,
    ),
    tagIds: [],
    enabled: input.enabled !== false,
  }));
  return {
    folders: [...otherFolders, ...folders],
    feeds: [...otherFeeds, ...feeds],
    items: state.items.filter((i) => otherFeedIds.has(i.feedId)),
    tags: state.tags.filter((t) => t.spaceId !== spaceId),
    added: feeds.length,
  };
}

function mergeOpmlFeeds(
  state: OpmlImportState,
  valid: OpmlFeedInput[],
  spaceId: string,
): OpmlImportState & { added: number } {
  let folders = [...state.folders];
  let feeds = [...state.feeds];
  const feedsByUrl = new Map(
    feeds.filter((f) => f.spaceId === spaceId).map((f) => [f.url, f]),
  );
  const folderIdByName = new Map(
    folders.filter((f) => f.spaceId === spaceId).map((f) => [f.name, f.id]),
  );
  let added = 0;

  for (const input of valid) {
    const folderName = input.folderName ?? 'Inbox';
    let folderId = folderIdByName.get(folderName);
    if (!folderId) {
      const folder: Folder = {
        id: createId('folder'),
        name: folderName,
        spaceId,
        sortOrder: folders.filter((f) => f.spaceId === spaceId).length,
      };
      folders = [...folders, folder];
      folderId = folder.id;
      folderIdByName.set(folderName, folderId);
    }

    const existing = feedsByUrl.get(input.url);
    if (existing) {
      if (!feedInFolder(existing, folderId)) {
        const updated = addFeedToFolder(existing, folderId);
        feeds = feeds.map((f) => (f.id === existing.id ? updated : f));
        feedsByUrl.set(input.url, updated);
        added += 1;
      }
      continue;
    }

    const feed: FeedSource = {
      id: createId('feed'),
      title: input.title,
      url: input.url,
      siteUrl: input.siteUrl,
      spaceId,
      folderIds: normalizeFeedFolderIds([folderId], spaceId),
      tagIds: [],
      enabled: input.enabled !== false,
    };
    feeds.push(feed);
    feedsByUrl.set(input.url, feed);
    added += 1;
  }

  return {
    folders,
    feeds,
    items: state.items,
    tags: state.tags,
    added,
  };
}
