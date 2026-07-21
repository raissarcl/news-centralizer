import { faviconUrlForFeed } from '../favicon';
import { inboxFolderId, normalizeFeedFolderIds } from '../feeds/feedFolders';
import { createId } from '../id';
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
