import { faviconUrlForFeed } from '../favicon';
import {
  inboxFolderId,
  normalizeFeedFolderIds,
} from '../feeds/feedFolders';
import { createId } from '../id';
import { normalizeFeedUrl } from '../items/dedupeItems';
import { validateFeedUrl } from '../security/urls';
import type { FeedSource, Folder } from '../../types';
import { flattenOpmlFeeds, parseOpml } from './index';

export const INBOX_FOLDER_NAME = 'Caixa de entrada';

export function slugifyFolder(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function ensureInboxFolder(
  folders: Folder[],
  spaceId: string,
): Folder[] {
  const id = inboxFolderId(spaceId);
  if (folders.some((f) => f.id === id)) {
    return folders.map((f) =>
      f.id === id ? { ...f, name: INBOX_FOLDER_NAME, spaceId } : f,
    );
  }
  return [{ id, name: INBOX_FOLDER_NAME, spaceId, sortOrder: -1 }, ...folders];
}

export function ensureSpaceInboxes(
  folders: Folder[],
  spaces: { id: string }[],
): Folder[] {
  let next = [...folders];
  for (const space of spaces) {
    next = ensureInboxFolder(next, space.id);
  }
  return next;
}

export type SeedUrlOptions = {
  allowHttp: boolean;
};

export function buildSeedFromOpml(
  opml: string,
  spaceId: string,
  urlOptions: SeedUrlOptions,
): {
  folders: Folder[];
  feeds: FeedSource[];
} {
  const outlines = parseOpml(opml);
  const feedInputs = flattenOpmlFeeds(outlines).filter(
    (input) => validateFeedUrl(input.url, urlOptions).ok,
  );
  const folderNames = [
    ...new Set(
      feedInputs.map((f) => f.folderName).filter((n): n is string => !!n),
    ),
  ];
  const folders: Folder[] = folderNames.map((name, index) => {
    const base = slugifyFolder(name) || `folder-${index}`;
    const id = `${spaceId}-${base}`;
    const isPapers = name.toLowerCase().includes('papers');
    return {
      id,
      name,
      spaceId,
      sortOrder: index,
      retentionDays: isPapers ? 7 : undefined,
    };
  });
  const folderIdByName = new Map(folders.map((f) => [f.name, f.id]));
  const inboxId = inboxFolderId(spaceId);

  const feeds: FeedSource[] = feedInputs.map((input) => {
    const folderNameLower = input.folderName?.toLowerCase() ?? '';
    const enabledFromAttr = input.enabled;
    const enabled =
      enabledFromAttr !== undefined
        ? enabledFromAttr
        : !folderNameLower.includes('papers');
    return {
      id: createId('feed'),
      title: input.title,
      url: input.url,
      siteUrl: input.siteUrl,
      favicon: faviconUrlForFeed(input.siteUrl, input.url),
      spaceId,
      folderIds: normalizeFeedFolderIds(
        [
          input.folderName
            ? (folderIdByName.get(input.folderName) ?? inboxId)
            : inboxId,
        ],
        spaceId,
      ),
      tagIds: [],
      enabled,
    };
  });

  return {
    folders: ensureInboxFolder(folders, spaceId),
    feeds,
  };
}

/**
 * Adds folders/feeds from a seed OPML that are missing by URL.
 * Does not remove or alter existing user feeds.
 */
export function mergeMissingSeedFeeds(
  existingFolders: Folder[],
  existingFeeds: FeedSource[],
  opml: string,
  spaceId: string,
  urlOptions: SeedUrlOptions,
): { folders: Folder[]; feeds: FeedSource[]; added: number } {
  const seeded = buildSeedFromOpml(opml, spaceId, urlOptions);
  const existingUrls = new Set(
    existingFeeds
      .filter((f) => f.spaceId === spaceId)
      .map((f) => normalizeFeedUrl(f.url)),
  );

  let folders = [...existingFolders];
  const folderIdByName = new Map(
    folders
      .filter((f) => f.spaceId === spaceId)
      .map((f) => [f.name, f.id]),
  );

  for (const folder of seeded.folders) {
    if (folder.id === inboxFolderId(spaceId)) continue;
    if (folderIdByName.has(folder.name)) continue;
    folders = [...folders, folder];
    folderIdByName.set(folder.name, folder.id);
  }

  const feeds = [...existingFeeds];
  let added = 0;
  const seedFolderNameById = new Map(
    seeded.folders.map((f) => [f.id, f.name]),
  );

  for (const seedFeed of seeded.feeds) {
    if (existingUrls.has(normalizeFeedUrl(seedFeed.url))) continue;

    const folderNames = seedFeed.folderIds
      .map((id) => seedFolderNameById.get(id))
      .filter((n): n is string => !!n && n !== INBOX_FOLDER_NAME);
    const folderIds = normalizeFeedFolderIds(
      folderNames.map(
        (name) => folderIdByName.get(name) ?? inboxFolderId(spaceId),
      ),
      spaceId,
    );

    feeds.push({
      ...seedFeed,
      id: createId('feed'),
      folderIds,
    });
    existingUrls.add(normalizeFeedUrl(seedFeed.url));
    added += 1;
  }

  return {
    folders: ensureInboxFolder(folders, spaceId),
    feeds,
    added,
  };
}
