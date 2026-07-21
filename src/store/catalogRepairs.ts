import { ENGBLOGS_STARTER_OPML } from '../data/engblogsStarter';
import {
  inboxFolderId,
  isInboxFolderId,
  LEGACY_INBOX_FOLDER_ID,
  normalizeFeedFolderIds,
} from '../lib/feeds/feedFolders';
import { createId } from '../lib/id';
import { dedupeItemsByLink, normalizeFeedUrl } from '../lib/items/dedupeItems';
import { flattenOpmlFeeds, parseOpml } from '../lib/opml';
import { INBOX_FOLDER_NAME, slugifyFolder } from '../lib/opml/seedFromOpml';
import { validateFeedUrl } from '../lib/security/urls';
import {
  COMPUTING_SPACE_ID,
  ensureDefaultSpaces,
  GENERAL_SPACE_ID,
  resolveActiveSpaceId,
} from '../lib/spaces';
import type { FeedSource, Folder, PersistedBlob, Settings } from '../types';

const REDUNDANT_HN_NEWEST_URL = normalizeFeedUrl('https://hnrss.org/newest');
const BROKEN_HN_AI_URL = normalizeFeedUrl('https://hnrss.org/newest?search=AI');

export function mergeEngBlogsIntoBlob(blob: PersistedBlob): PersistedBlob {
  const outlines = parseOpml(ENGBLOGS_STARTER_OPML);
  const feedInputs = flattenOpmlFeeds(outlines).filter(
    (input) =>
      validateFeedUrl(input.url, { allowHttp: blob.settings.allowHttpFeeds })
        .ok,
  );
  const existingUrls = new Set(blob.feeds.map((f) => f.url));
  let folders = [...blob.folders];
  const folderIdByName = new Map(
    folders
      .filter((f) => f.spaceId === COMPUTING_SPACE_ID)
      .map((f) => [f.name, f.id]),
  );
  const feeds = [...blob.feeds];
  let added = 0;

  for (const input of feedInputs) {
    if (existingUrls.has(input.url)) continue;
    const folderName = input.folderName ?? 'Eng Blogs';
    let folderId = folderIdByName.get(folderName);
    if (!folderId) {
      const folder: Folder = {
        id: slugifyFolder(folderName) || createId('folder'),
        name: folderName,
        spaceId: COMPUTING_SPACE_ID,
        sortOrder: folders.length,
      };
      folders = [...folders, folder];
      folderId = folder.id;
      folderIdByName.set(folderName, folderId);
    }
    feeds.push({
      id: createId('feed'),
      title: input.title,
      url: input.url,
      siteUrl: input.siteUrl,
      spaceId: COMPUTING_SPACE_ID,
      folderIds: normalizeFeedFolderIds([folderId], COMPUTING_SPACE_ID),
      tagIds: [],
      enabled: true,
    });
    existingUrls.add(input.url);
    added += 1;
  }

  if (added === 0) return blob;
  return { ...blob, folders, feeds };
}

function removeFeedsByUrl(
  blob: PersistedBlob,
  normalizedUrl: string,
): PersistedBlob {
  const removedFeedIds = new Set(
    blob.feeds
      .filter((f) => normalizeFeedUrl(f.url) === normalizedUrl)
      .map((f) => f.id),
  );
  if (removedFeedIds.size === 0) return blob;
  const feeds = blob.feeds.filter((f) => !removedFeedIds.has(f.id));
  const items = blob.items.filter((i) => !removedFeedIds.has(i.feedId));
  return { ...blob, feeds, items };
}

export function dedupeHnAndItems(blob: PersistedBlob): PersistedBlob {
  const removedFeedIds = new Set(
    blob.feeds
      .filter((f) => normalizeFeedUrl(f.url) === REDUNDANT_HN_NEWEST_URL)
      .map((f) => f.id),
  );
  const feeds = blob.feeds.filter((f) => !removedFeedIds.has(f.id));
  const items = dedupeItemsByLink(
    blob.items.filter((i) => !removedFeedIds.has(i.feedId)),
  );
  return { ...blob, feeds, items };
}

export function removeBrokenHnAiFeed(blob: PersistedBlob): PersistedBlob {
  return removeFeedsByUrl(blob, BROKEN_HN_AI_URL);
}

function getFeedFolderIdsFromLegacy(
  feed: FeedSource & { folderId?: string },
): string[] {
  if (feed.folderIds?.length) return feed.folderIds;
  if (typeof feed.folderId === 'string') return [feed.folderId];
  return [inboxFolderId(feed.spaceId || COMPUTING_SPACE_ID)];
}

export function migrateToSpaces(blob: PersistedBlob): PersistedBlob {
  const spaces = ensureDefaultSpaces(blob.spaces);
  const computingInboxId = inboxFolderId(COMPUTING_SPACE_ID);
  const generalInboxId = inboxFolderId(GENERAL_SPACE_ID);

  let folders = blob.folders.map((folder) => {
    const id =
      folder.id === LEGACY_INBOX_FOLDER_ID ? computingInboxId : folder.id;
    return {
      ...folder,
      id,
      spaceId: folder.spaceId || COMPUTING_SPACE_ID,
      name: isInboxFolderId(id) ? INBOX_FOLDER_NAME : folder.name,
    };
  });

  if (!folders.some((f) => f.id === computingInboxId)) {
    folders = [
      {
        id: computingInboxId,
        name: INBOX_FOLDER_NAME,
        spaceId: COMPUTING_SPACE_ID,
        sortOrder: -1,
      },
      ...folders,
    ];
  }

  if (!folders.some((f) => f.id === generalInboxId)) {
    folders = [
      ...folders,
      {
        id: generalInboxId,
        name: INBOX_FOLDER_NAME,
        spaceId: GENERAL_SPACE_ID,
        sortOrder: -1,
      },
    ];
  }

  const folderIdsInSpace = new Map<string, Set<string>>();
  for (const folder of folders) {
    const set = folderIdsInSpace.get(folder.spaceId) ?? new Set<string>();
    set.add(folder.id);
    folderIdsInSpace.set(folder.spaceId, set);
  }

  const feeds = blob.feeds.map((feed) => {
    const spaceId = feed.spaceId || COMPUTING_SPACE_ID;
    const allowed = folderIdsInSpace.get(spaceId) ?? new Set<string>();
    const inboxId = inboxFolderId(spaceId);
    const mapped = getFeedFolderIdsFromLegacy(feed)
      .map((id) => (id === LEGACY_INBOX_FOLDER_ID ? computingInboxId : id))
      .filter((id) => allowed.has(id) || id === inboxId);
    return {
      ...feed,
      spaceId,
      folderIds: normalizeFeedFolderIds(mapped, spaceId),
    };
  });

  const tags = blob.tags.map((tag) => ({
    ...tag,
    spaceId: tag.spaceId || COMPUTING_SPACE_ID,
  }));

  const settings: Settings = {
    ...blob.settings,
    activeSpaceId: resolveActiveSpaceId(blob.settings.activeSpaceId, spaces),
    seededGeneral: blob.settings.seededGeneral === true,
  };

  return {
    ...blob,
    spaces,
    folders,
    feeds,
    tags,
    settings,
  };
}

/** Always-on structural repair (spaces/inboxes), not catalog URL patches. */
export function applyCatalogRepairs(blob: PersistedBlob): PersistedBlob {
  return migrateToSpaces(blob);
}

export { getFeedFolderIdsFromLegacy };
