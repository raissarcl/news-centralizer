import { faviconUrlForFeed } from '../favicon';
import { inboxFolderId, normalizeFeedFolderIds } from '../feeds/feedFolders';
import { createId } from '../id';
import { normalizeFeedUrl } from '../items/dedupeItems';
import { validateFeedUrl } from '../security/urls';
import type { FeedCatalog } from '../../data/feeds/types';
import type { FeedSource, Folder } from '../../types';
import { feedUrlAliases } from '../feeds/feedUrlAliases';

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

export function buildSeedFromCatalog(
  catalog: FeedCatalog,
  spaceId: string,
  urlOptions: SeedUrlOptions,
): {
  folders: Folder[];
  feeds: FeedSource[];
} {
  const folders: Folder[] = catalog.folders.map((folder, index) => {
    const base = slugifyFolder(folder.name) || `folder-${index}`;
    const id = `${spaceId}-${base}`;
    const isPapers = folder.name.toLowerCase().includes('papers');
    return {
      id,
      name: folder.name,
      spaceId,
      sortOrder: index,
      retentionDays: folder.retentionDays ?? (isPapers ? 7 : undefined),
    };
  });
  const folderIdByName = new Map(folders.map((f) => [f.name, f.id]));
  const inboxId = inboxFolderId(spaceId);

  const feeds: FeedSource[] = [];
  for (const folder of catalog.folders) {
    const folderNameLower = folder.name.toLowerCase();
    const folderId = folderIdByName.get(folder.name) ?? inboxId;
    for (const entry of folder.feeds) {
      if (!validateFeedUrl(entry.url, urlOptions).ok) continue;
      const enabled =
        entry.enabled !== undefined
          ? entry.enabled
          : !folderNameLower.includes('papers');
      feeds.push({
        id: createId('feed'),
        title: entry.title,
        url: entry.url,
        siteUrl: entry.siteUrl,
        favicon: faviconUrlForFeed(entry.siteUrl, entry.url),
        spaceId,
        folderIds: normalizeFeedFolderIds([folderId], spaceId),
        tagIds: [],
        enabled,
      });
    }
  }

  return {
    folders: ensureInboxFolder(folders, spaceId),
    feeds,
  };
}

export type MergeSeedOptions = SeedUrlOptions & {
  /** Normalized URLs the user deleted; never re-add these. */
  removedFeedUrls?: string[];
};

/**
 * Adds folders/feeds from a seed catalog that are missing by URL.
 * Does not remove or alter existing user feeds.
 */
export function mergeMissingSeedFeeds(
  existingFolders: Folder[],
  existingFeeds: FeedSource[],
  catalog: FeedCatalog,
  spaceId: string,
  urlOptions: MergeSeedOptions,
): { folders: Folder[]; feeds: FeedSource[]; added: number } {
  const seeded = buildSeedFromCatalog(catalog, spaceId, urlOptions);
  const removed = new Set(
    (urlOptions.removedFeedUrls ?? []).map((u) => normalizeFeedUrl(u)),
  );
  const existingUrls = new Set(
    existingFeeds
      .filter((f) => f.spaceId === spaceId)
      .map((f) => normalizeFeedUrl(f.url)),
  );

  let folders = [...existingFolders];
  const folderIdByName = new Map(
    folders.filter((f) => f.spaceId === spaceId).map((f) => [f.name, f.id]),
  );

  for (const folder of seeded.folders) {
    if (folder.id === inboxFolderId(spaceId)) continue;
    if (folderIdByName.has(folder.name)) continue;
    folders = [...folders, folder];
    folderIdByName.set(folder.name, folder.id);
  }

  const feeds = [...existingFeeds];
  let added = 0;
  const seedFolderNameById = new Map(seeded.folders.map((f) => [f.id, f.name]));

  for (const seedFeed of seeded.feeds) {
    const normalized = normalizeFeedUrl(seedFeed.url);
    const aliases = feedUrlAliases(normalized);
    if (aliases.some((u) => existingUrls.has(u) || removed.has(u))) {
      continue;
    }

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
    for (const alias of aliases) existingUrls.add(alias);
    added += 1;
  }

  return {
    folders: ensureInboxFolder(folders, spaceId),
    feeds,
    added,
  };
}
