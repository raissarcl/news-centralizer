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
  GOOGLE_DEVELOPERS_BLOG_OLD_URL,
  GOOGLE_DEVELOPERS_BLOG_URL,
  feedUrlAliases,
} from '../lib/feeds/feedUrlAliases';
import {
  COMPUTING_SPACE_ID,
  ensureDefaultSpaces,
  GENERAL_SPACE_ID,
  resolveActiveSpaceId,
} from '../lib/spaces';
import type { FeedSource, Folder, PersistedBlob, Settings } from '../types';

const REDUNDANT_HN_NEWEST_URL = normalizeFeedUrl('https://hnrss.org/newest');
const BROKEN_HN_AI_URL = normalizeFeedUrl('https://hnrss.org/newest?search=AI');

export {
  GOOGLE_DEVELOPERS_BLOG_OLD_URL,
  GOOGLE_DEVELOPERS_BLOG_URL,
  feedUrlAliases,
} from '../lib/feeds/feedUrlAliases';

function removedUrlSet(blob: PersistedBlob): Set<string> {
  return new Set(
    (blob.settings.removedFeedUrls ?? []).map((u) => normalizeFeedUrl(u)),
  );
}

/** Rewrite undated Blogger Atom URL to blog.google RSS (has pubDate). */
export function rewriteGoogleDevelopersBlogUrl(
  blob: PersistedBlob,
): PersistedBlob {
  const removed = removedUrlSet(blob);
  const newNormalized = normalizeFeedUrl(GOOGLE_DEVELOPERS_BLOG_URL);
  if (removed.has(GOOGLE_DEVELOPERS_BLOG_OLD_URL) || removed.has(newNormalized)) {
    // Drop any lingering copies if the user deleted this catalog feed.
    const dropIds = new Set(
      blob.feeds
        .filter((f) => {
          const n = normalizeFeedUrl(f.url);
          return n === GOOGLE_DEVELOPERS_BLOG_OLD_URL || n === newNormalized;
        })
        .map((f) => f.id),
    );
    if (dropIds.size === 0) return blob;
    return {
      ...blob,
      feeds: blob.feeds.filter((f) => !dropIds.has(f.id)),
      items: blob.items.filter((i) => !dropIds.has(i.feedId)),
    };
  }

  let changed = false;
  const feeds = blob.feeds.map((feed) => {
    if (normalizeFeedUrl(feed.url) !== GOOGLE_DEVELOPERS_BLOG_OLD_URL) {
      return feed;
    }
    changed = true;
    return {
      ...feed,
      url: GOOGLE_DEVELOPERS_BLOG_URL,
      siteUrl: feed.siteUrl ?? 'https://blog.google/technology/developers/',
      etag: undefined,
      lastModified: undefined,
      lastError: undefined,
    };
  });

  // Dedupe if v13 seed merge already added the new URL alongside the old one.
  const seen = new Set<string>();
  const deduped: FeedSource[] = [];
  const droppedIds = new Set<string>();
  for (const feed of feeds) {
    const n = normalizeFeedUrl(feed.url);
    if (
      (n === newNormalized || n === GOOGLE_DEVELOPERS_BLOG_OLD_URL) &&
      seen.has(newNormalized)
    ) {
      droppedIds.add(feed.id);
      changed = true;
      continue;
    }
    if (n === newNormalized || n === GOOGLE_DEVELOPERS_BLOG_OLD_URL) {
      seen.add(newNormalized);
    }
    deduped.push(feed);
  }

  if (!changed) return blob;
  return {
    ...blob,
    feeds: deduped,
    items: blob.items.filter((i) => !droppedIds.has(i.feedId)),
  };
}

export function mergeEngBlogsIntoBlob(blob: PersistedBlob): PersistedBlob {
  const outlines = parseOpml(ENGBLOGS_STARTER_OPML);
  const feedInputs = flattenOpmlFeeds(outlines).filter(
    (input) =>
      validateFeedUrl(input.url, { allowHttp: blob.settings.allowHttpFeeds })
        .ok,
  );
  const removed = removedUrlSet(blob);
  const existingUrls = new Set(
    blob.feeds.map((f) => normalizeFeedUrl(f.url)),
  );
  // Expand aliases so old Google URL blocks re-adding the new one.
  for (const url of [...existingUrls]) {
    for (const alias of feedUrlAliases(url)) existingUrls.add(alias);
  }
  let folders = [...blob.folders];
  const folderIdByName = new Map(
    folders
      .filter((f) => f.spaceId === COMPUTING_SPACE_ID)
      .map((f) => [f.name, f.id]),
  );
  const feeds = [...blob.feeds];
  let added = 0;

  for (const input of feedInputs) {
    const normalized = normalizeFeedUrl(input.url);
    const aliases = feedUrlAliases(normalized);
    if (aliases.some((u) => existingUrls.has(u) || removed.has(u))) continue;
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
    for (const alias of aliases) existingUrls.add(alias);
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

const HN_FRONTPAGE_URL = normalizeFeedUrl('https://hnrss.org/frontpage');

const RETIRED_FEED_URLS = [
  'https://rss.uol.com.br/feed/noticias.xml',
  'https://rss.dw.com/rdf/rss-br-top',
  'https://dev.to/feed',
  // Keep HN frontpage; retire the secondary HN feeds only.
  'https://hnrss.org/newest',
  'https://hnrss.org/newest?search=AI',
].map((url) => normalizeFeedUrl(url));

/** Folha de SP host patterns (not Folha de Pernambuco). */
function isRetiredFolhaSpUrl(url: string): boolean {
  const n = normalizeFeedUrl(url).toLowerCase();
  return (
    n.includes('feeds.folha.uol.com.br') || n.includes('www1.folha.uol.com.br')
  );
}

/** Drop catalog feeds the user asked to retire from seed + existing installs. */
export function removeRetiredCatalogFeeds(blob: PersistedBlob): PersistedBlob {
  const removedFeedIds = new Set(
    blob.feeds
      .filter((f) => {
        const n = normalizeFeedUrl(f.url);
        return RETIRED_FEED_URLS.includes(n) || isRetiredFolhaSpUrl(f.url);
      })
      .map((f) => f.id),
  );
  if (removedFeedIds.size === 0) return blob;
  return {
    ...blob,
    feeds: blob.feeds.filter((f) => !removedFeedIds.has(f.id)),
    items: blob.items.filter((i) => !removedFeedIds.has(i.feedId)),
  };
}

/** Re-add HN front page if a previous migration removed it by mistake. */
export function ensureHnFrontpageFeed(blob: PersistedBlob): PersistedBlob {
  const removed = removedUrlSet(blob);
  if (removed.has(HN_FRONTPAGE_URL)) return blob;

  const hasFrontpage = blob.feeds.some(
    (f) => normalizeFeedUrl(f.url) === HN_FRONTPAGE_URL,
  );
  if (hasFrontpage) return blob;

  const spaces = ensureDefaultSpaces(blob.spaces);
  let folders = [...blob.folders];
  const computingFolders = folders.filter(
    (f) => f.spaceId === COMPUTING_SPACE_ID,
  );
  let comunidade = computingFolders.find((f) => f.name === 'Comunidade');
  if (!comunidade) {
    comunidade = {
      id: slugifyFolder('Comunidade') || createId('folder'),
      name: 'Comunidade',
      spaceId: COMPUTING_SPACE_ID,
      sortOrder: computingFolders.length,
    };
    folders = [...folders, comunidade];
  }

  const feed: FeedSource = {
    id: createId('feed'),
    title: 'Hacker News — Front Page',
    url: 'https://hnrss.org/frontpage',
    siteUrl: 'https://news.ycombinator.com/',
    spaceId: COMPUTING_SPACE_ID,
    folderIds: normalizeFeedFolderIds([comunidade.id], COMPUTING_SPACE_ID),
    tagIds: [],
    enabled: true,
  };

  return {
    ...blob,
    spaces,
    folders,
    feeds: [...blob.feeds, feed],
  };
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
    removedFeedUrls: Array.isArray(blob.settings.removedFeedUrls)
      ? blob.settings.removedFeedUrls
      : [],
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
