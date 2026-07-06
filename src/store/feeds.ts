import { create } from 'zustand';
import type {
  FeedItem,
  FeedSource,
  Folder,
  Settings,
  Tag,
  TimelineFilter,
  TimelinePeriod,
} from '../types';
import { createId } from '../lib/id';
import { DEFAULT_FEEDS_OPML } from '../data/defaultFeedsOpml';
import { flattenOpmlFeeds, parseOpml, type OpmlFeedInput } from '../lib/opml';
import {
  applyRetention,
  fetchFeed,
  mapPool,
  REFRESH_CONCURRENCY,
} from '../lib/rss/fetchFeed';
import { faviconUrlForFeed } from '../lib/favicon';
import {
  validateFeedUrl,
} from '../lib/security/urls';
import {
  capFeedInputs,
  filterValidFeedInputs,
} from '../lib/security/importLimits';
import { sortItemsByPublishedDesc } from '../lib/items/sortItems';
import { normalizeItemLink } from '../lib/items/dedupeItems';
import {
  filterItemsForFeed,
  filterItemsForFolder,
  selectVisibleItems,
} from '../lib/feeds/selectItems';
import { buildBlob, loadBlob, saveBlob } from './persistence';
import { useSettingsStore } from './settings';
import {
  addFeedToFolder,
  feedInFolder,
  getFeedFolderIds,
  INBOX_FOLDER_ID,
  normalizeFeedFolderIds,
  removeFeedFromFolder,
  toggleFeedFolderMembership,
} from '../lib/feeds/feedFolders';

export { selectVisibleItems, filterItemsForFolder, filterItemsForFeed };

async function afterDataChange(): Promise<void> {
  const { syncAndroidWidget } = await import('../lib/widget');
  await syncAndroidWidget();
}

const REFRESH_FAIL_THRESHOLD = 3;
const REFRESH_PAUSE_MS = 15 * 60 * 1000;

function feedUrlOptions() {
  return { allowHttp: useSettingsStore.getState().settings.allowHttpFeeds };
}

function isFeedPaused(feed: FeedSource): boolean {
  if (!feed.refreshPausedUntil) return false;
  return new Date(feed.refreshPausedUntil).getTime() > Date.now();
}

function refreshStateAfterFetch(
  feed: FeedSource,
  error?: string
): Pick<FeedSource, 'refreshFailCount' | 'refreshPausedUntil'> {
  if (!error) {
    return { refreshFailCount: 0, refreshPausedUntil: undefined };
  }
  const failCount = (feed.refreshFailCount ?? 0) + 1;
  if (failCount >= REFRESH_FAIL_THRESHOLD) {
    return {
      refreshFailCount: failCount,
      refreshPausedUntil: new Date(Date.now() + REFRESH_PAUSE_MS).toISOString(),
    };
  }
  return { refreshFailCount: failCount, refreshPausedUntil: feed.refreshPausedUntil };
}

export type RefreshProgress = {
  done: number;
  total: number;
};

type FeedsState = {
  feeds: FeedSource[];
  items: FeedItem[];
  folders: Folder[];
  tags: Tag[];
  hydrated: boolean;
  refreshing: boolean;
  refreshProgress: RefreshProgress | null;
  timelineFilter: TimelineFilter;
  timelinePeriod: TimelinePeriod;
  searchQuery: string;
  selectedTagId: string | null;
  selectedFolderId: string | null;
  selectedFeedIds: string[];
  hydrate: () => Promise<void>;
  persist: (settings?: Settings) => Promise<void>;
  seedDefaultsIfNeeded: () => Promise<void>;
  refreshAll: () => Promise<{ newCount: number; newHeadlines: string[] }>;
  refreshFeed: (feedId: string) => Promise<{ newCount: number; newHeadlines: string[] }>;
  markAllReadInFolder: (folderId: string) => Promise<void>;
  purgeItemsByRetention: () => Promise<{ removed: number; remaining: number }>;
  removeReadItems: () => Promise<number>;
  clearAllItems: () => Promise<void>;
  updateFeed: (
    feedId: string,
    patch: Partial<Pick<FeedSource, 'title' | 'url' | 'folderIds' | 'siteUrl'>>
  ) => Promise<void>;
  toggleFeedEnabled: (feedId: string) => Promise<void>;
  resumeFeed: (feedId: string) => Promise<void>;
  resumeAllPausedFeeds: () => Promise<void>;
  markItemRead: (itemId: string, read?: boolean) => Promise<void>;
  toggleItemStarred: (itemId: string) => Promise<void>;
  setTimelineFilter: (filter: TimelineFilter) => void;
  setTimelinePeriod: (period: TimelinePeriod) => void;
  setSearchQuery: (query: string) => void;
  setSelectedTagId: (tagId: string | null) => void;
  setSelectedFolderId: (folderId: string | null) => void;
  setSelectedFeedIds: (feedIds: string[]) => void;
  addFeed: (input: {
    title: string;
    url: string;
    siteUrl?: string;
    folderId: string;
    tagIds?: string[];
  }) => Promise<'ok' | 'invalid' | 'duplicate'>;
  removeFeed: (feedId: string) => Promise<void>;
  addFolder: (name: string) => Promise<void>;
  renameFolder: (folderId: string, name: string) => Promise<void>;
  removeFolder: (folderId: string) => Promise<void>;
  updateFolderRetention: (folderId: string, retentionDays: number | null) => Promise<void>;
  toggleFeedFolder: (feedId: string, folderId: string) => Promise<boolean>;
  addTag: (name: string, color?: string) => Promise<void>;
  renameTag: (tagId: string, name: string) => Promise<void>;
  removeTag: (tagId: string) => Promise<void>;
  assignTagsToFeed: (feedId: string, tagIds: string[]) => Promise<void>;
  importOpmlFeeds: (
    feeds: OpmlFeedInput[],
    mode: 'merge' | 'replace'
  ) => Promise<{ added: number; skipped: number }>;
  replaceAll: (payload: {
    feeds: FeedSource[];
    items: FeedItem[];
    folders: Folder[];
    tags: Tag[];
  }) => Promise<void>;
};

const INBOX_FOLDER_NAME = 'Caixa de entrada';

function ensureInboxFolder(folders: Folder[]): Folder[] {
  if (folders.some((f) => f.id === INBOX_FOLDER_ID)) {
    return folders.map((f) =>
      f.id === INBOX_FOLDER_ID ? { ...f, name: INBOX_FOLDER_NAME } : f
    );
  }
  return [
    { id: INBOX_FOLDER_ID, name: INBOX_FOLDER_NAME, sortOrder: -1 },
    ...folders,
  ];
}
function slugifyFolder(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildSeedFromOpml(opml: string): {
  folders: Folder[];
  feeds: FeedSource[];
} {
  const outlines = parseOpml(opml);
  const feedInputs = flattenOpmlFeeds(outlines).filter(
    (input) => validateFeedUrl(input.url, feedUrlOptions()).ok
  );
  const folderNames = [
    ...new Set(
      feedInputs.map((f) => f.folderName).filter((n): n is string => !!n)
    ),
  ];
  const folders: Folder[] = folderNames.map((name, index) => {
    const id = slugifyFolder(name) || `folder-${index}`;
    const isPapers = name.toLowerCase().includes('papers');
    return {
      id,
      name,
      sortOrder: index,
      retentionDays: isPapers ? 7 : undefined,
    };
  });
  const folderIdByName = new Map(folders.map((f) => [f.name, f.id]));

  const feeds: FeedSource[] = feedInputs.map((input) => ({
    id: createId('feed'),
    title: input.title,
    url: input.url,
    siteUrl: input.siteUrl,
    favicon: faviconUrlForFeed(input.siteUrl, input.url),
    folderIds: normalizeFeedFolderIds([
      input.folderName
        ? (folderIdByName.get(input.folderName) ?? INBOX_FOLDER_ID)
        : INBOX_FOLDER_ID,
    ]),
    tagIds: [],
    enabled: !input.folderName?.toLowerCase().includes('papers'),
  }));

  return { folders, feeds };
}

async function mergeRefreshResults(
  allFeeds: FeedSource[],
  enabledFeeds: FeedSource[],
  existingItems: FeedItem[],
  folders: Folder[],
  onProgress?: (done: number, total: number) => void
): Promise<{
  feeds: FeedSource[];
  items: FeedItem[];
  newCount: number;
  newHeadlines: string[];
}> {
  let done = 0;
  const existingById = new Map(existingItems.map((i) => [i.id, i]));
  const existingByLink = new Map<string, FeedItem>();
  for (const item of existingItems) {
    const linkKey = normalizeItemLink(item.link);
    if (linkKey) existingByLink.set(linkKey, item);
  }
  const feedUpdates = new Map<string, FeedSource>();
  let newCount = 0;
  const newHeadlines: string[] = [];

  await mapPool(enabledFeeds, REFRESH_CONCURRENCY, async (feed) => {
    if (isFeedPaused(feed)) {
      done += 1;
      onProgress?.(done, enabledFeeds.length);
      return;
    }

    const result = await fetchFeed(feed);
    done += 1;
    onProgress?.(done, enabledFeeds.length);

    const refreshState = refreshStateAfterFetch(feed, result.error);
    const updatedFeed: FeedSource = {
      ...feed,
      ...refreshState,
      favicon: feed.favicon ?? faviconUrlForFeed(feed.siteUrl, feed.url),
      lastFetchedAt: new Date().toISOString(),
      etag: result.etag ?? feed.etag,
      lastModified: result.lastModified ?? feed.lastModified,
      lastError: result.error,
    };
    feedUpdates.set(feed.id, updatedFeed);

    if (!result.notModified) {
      for (const entry of result.entries) {
        const linkKey = normalizeItemLink(entry.link);
        if (linkKey) {
          const dupe = existingByLink.get(linkKey);
          if (dupe) {
            const prev = existingById.get(dupe.id)!;
            if (!prev.imageUrl && entry.imageUrl) {
              existingById.set(dupe.id, { ...prev, imageUrl: entry.imageUrl });
            }
            continue;
          }
        }

        if (!existingById.has(entry.id)) {
          const newItem: FeedItem = {
            id: entry.id,
            feedId: feed.id,
            title: entry.title,
            link: entry.link,
            summary: entry.summary,
            imageUrl: entry.imageUrl,
            publishedAt: entry.publishedAt,
            read: false,
            starred: false,
          };
          existingById.set(entry.id, newItem);
          if (linkKey) existingByLink.set(linkKey, newItem);
          newCount += 1;
          if (newHeadlines.length < 5) {
            newHeadlines.push(entry.title);
          }
        } else {
          const prev = existingById.get(entry.id)!;
          if (!prev.imageUrl && entry.imageUrl) {
            existingById.set(entry.id, { ...prev, imageUrl: entry.imageUrl });
          }
        }
      }
    }
  });

  const nextFeeds = allFeeds.map((f) => feedUpdates.get(f.id) ?? f);
  let nextItems = sortItemsByPublishedDesc([...existingById.values()]);
  const settings = useSettingsStore.getState().settings;
  nextItems = applyRetention(
    nextItems,
    settings.retentionDays,
    nextFeeds,
    folders
  );

  return { feeds: nextFeeds, items: nextItems, newCount, newHeadlines };
}

export const useFeedsStore = create<FeedsState>((set, get) => ({
  feeds: [],
  items: [],
  folders: [],
  tags: [],
  hydrated: false,
  refreshing: false,
  refreshProgress: null,
  timelineFilter: 'all',
  timelinePeriod: 'all',
  searchQuery: '',
  selectedTagId: null,
  selectedFolderId: null,
  selectedFeedIds: [],

  hydrate: async () => {
    const blob = await loadBlob();
    set({
      feeds: blob.feeds,
      items: sortItemsByPublishedDesc(blob.items),
      folders: blob.folders,
      tags: blob.tags,
      hydrated: true,
    });
  },

  persist: async (settings) => {
    const s = settings ?? useSettingsStore.getState().settings;
    const { feeds, items, folders, tags } = get();
    await saveBlob(buildBlob(feeds, items, folders, tags, s));
  },

  seedDefaultsIfNeeded: async () => {
    const settings = useSettingsStore.getState().settings;
    if (settings.seeded || get().feeds.length > 0) return;

    const { folders, feeds } = buildSeedFromOpml(DEFAULT_FEEDS_OPML);
    set({ folders, feeds });
    await useSettingsStore.getState().update({ seeded: true });
    await get().persist({ ...settings, seeded: true });
  },

  refreshAll: async () => {
    const state = get();
    const enabledFeeds = state.feeds.filter((f) => f.enabled && !isFeedPaused(f));
    if (enabledFeeds.length === 0) return { newCount: 0, newHeadlines: [] };

    set({
      refreshing: true,
      refreshProgress: { done: 0, total: enabledFeeds.length },
    });

    const { feeds, items, newCount, newHeadlines } = await mergeRefreshResults(
      state.feeds,
      enabledFeeds,
      state.items,
      state.folders,
      (done, total) => set({ refreshProgress: { done, total } })
    );

    set({
      feeds,
      items,
      refreshing: false,
      refreshProgress: null,
    });
    await get().persist();
    await afterDataChange();
    return { newCount, newHeadlines };
  },

  refreshFeed: async (feedId) => {
    const state = get();
    const feed = state.feeds.find((f) => f.id === feedId);
    if (!feed || !feed.enabled) return { newCount: 0, newHeadlines: [] as string[] };

    set({ refreshing: true, refreshProgress: { done: 0, total: 1 } });
    const { feeds, items, newCount, newHeadlines } = await mergeRefreshResults(
      state.feeds,
      [feed],
      state.items,
      state.folders,
      () => set({ refreshProgress: { done: 1, total: 1 } })
    );
    set({ feeds, items, refreshing: false, refreshProgress: null });
    await get().persist();
    await afterDataChange();
    return { newCount, newHeadlines };
  },

  markAllReadInFolder: async (folderId) => {
    const feedIds = new Set(
      get()
        .feeds.filter((f) => feedInFolder(f, folderId))
        .map((f) => f.id)
    );
    set({
      items: get().items.map((i) =>
        feedIds.has(i.feedId) ? { ...i, read: true } : i
      ),
    });
    await get().persist();
    await afterDataChange();
  },

  purgeItemsByRetention: async () => {
    const settings = useSettingsStore.getState().settings;
    const before = get().items.length;
    const nextItems = applyRetention(
      get().items,
      settings.retentionDays,
      get().feeds,
      get().folders
    );
    set({ items: sortItemsByPublishedDesc(nextItems) });
    await get().persist();
    await afterDataChange();
    return { removed: before - nextItems.length, remaining: nextItems.length };
  },

  removeReadItems: async () => {
    const before = get().items.length;
    const nextItems = get().items.filter((i) => !i.read || i.starred);
    set({ items: sortItemsByPublishedDesc(nextItems) });
    await get().persist();
    await afterDataChange();
    return before - nextItems.length;
  },

  clearAllItems: async () => {
    set({ items: [] });
    await get().persist();
    await afterDataChange();
  },

  updateFeed: async (feedId, patch) => {
    if (patch.url) {
      const validated = validateFeedUrl(patch.url, feedUrlOptions());
      if (!validated.ok) return;
    }
    const normalizedPatch = {
      ...patch,
      ...(patch.folderIds ? { folderIds: normalizeFeedFolderIds(patch.folderIds) } : {}),
    };
    set({
      feeds: get().feeds.map((f) =>
        f.id === feedId
          ? {
              ...f,
              ...normalizedPatch,
              favicon:
                patch.siteUrl || patch.url
                  ? faviconUrlForFeed(
                      patch.siteUrl ?? f.siteUrl,
                      patch.url ?? f.url
                    )
                  : f.favicon,
            }
          : f
      ),
    });
    await get().persist();
  },

  toggleFeedEnabled: async (feedId) => {
    set({
      feeds: get().feeds.map((f) =>
        f.id === feedId ? { ...f, enabled: !f.enabled } : f
      ),
    });
    await get().persist();
  },

  resumeFeed: async (feedId) => {
    set({
      feeds: get().feeds.map((f) =>
        f.id === feedId
          ? {
              ...f,
              refreshFailCount: 0,
              refreshPausedUntil: undefined,
              lastError: undefined,
            }
          : f
      ),
    });
    await get().persist();
  },

  resumeAllPausedFeeds: async () => {
    const now = Date.now();
    set({
      feeds: get().feeds.map((f) => {
        const paused =
          f.refreshPausedUntil &&
          new Date(f.refreshPausedUntil).getTime() > now;
        if (!paused) return f;
        return {
          ...f,
          refreshFailCount: 0,
          refreshPausedUntil: undefined,
          lastError: undefined,
        };
      }),
    });
    await get().persist();
  },

  markItemRead: async (itemId, read = true) => {
    set({
      items: get().items.map((i) =>
        i.id === itemId ? { ...i, read } : i
      ),
    });
    await get().persist();
  },

  toggleItemStarred: async (itemId) => {
    set({
      items: get().items.map((i) =>
        i.id === itemId ? { ...i, starred: !i.starred } : i
      ),
    });
    await get().persist();
  },

  setTimelineFilter: (filter) => set({ timelineFilter: filter }),
  setTimelinePeriod: (period) => set({ timelinePeriod: period }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedTagId: (tagId) => set({ selectedTagId: tagId }),
  setSelectedFolderId: (folderId) => set({ selectedFolderId: folderId }),
  setSelectedFeedIds: (feedIds) => set({ selectedFeedIds: feedIds }),

  addFeed: async (input) => {
    const validated = validateFeedUrl(input.url, feedUrlOptions());
    if (!validated.ok) return 'invalid';

    const href = validated.url.href;
    const existing = get().feeds.find((f) => f.url === href);
    if (existing) {
      if (feedInFolder(existing, input.folderId)) return 'duplicate';
      set({
        feeds: get().feeds.map((f) =>
          f.id === existing.id ? addFeedToFolder(f, input.folderId) : f
        ),
      });
      await get().persist();
      return 'ok';
    }

    const feed: FeedSource = {
      id: createId('feed'),
      title: input.title.trim() || input.url,
      url: href,
      siteUrl: input.siteUrl,
      favicon: faviconUrlForFeed(input.siteUrl, href),
      folderIds: normalizeFeedFolderIds([input.folderId]),
      tagIds: input.tagIds ?? [],
      enabled: true,
    };
    set({ feeds: [...get().feeds, feed] });
    await get().persist();
    return 'ok';
  },

  removeFeed: async (feedId) => {
    set({
      feeds: get().feeds.filter((f) => f.id !== feedId),
      items: get().items.filter((i) => i.feedId !== feedId),
    });
    await get().persist();
  },

  addFolder: async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const folder: Folder = {
      id: createId('folder'),
      name: trimmed,
      sortOrder: get().folders.length,
    };
    set({ folders: [...get().folders, folder] });
    await get().persist();
  },

  renameFolder: async (folderId, name) => {
    const trimmed = name.trim();
    if (!trimmed || folderId === INBOX_FOLDER_ID) return;
    set({
      folders: get().folders.map((f) =>
        f.id === folderId ? { ...f, name: trimmed } : f
      ),
    });
    await get().persist();
  },

  removeFolder: async (folderId) => {
    if (folderId === INBOX_FOLDER_ID) return;
    const folders = ensureInboxFolder(get().folders.filter((f) => f.id !== folderId));
    set({
      folders,
      feeds: get().feeds.map((f) => {
        if (!feedInFolder(f, folderId)) return f;
        const next = removeFeedFromFolder(f, folderId);
        if (getFeedFolderIds(next).length > 0) return next;
        return addFeedToFolder(f, INBOX_FOLDER_ID);
      }),
    });
    await get().persist();
  },

  updateFolderRetention: async (folderId, retentionDays) => {
    set({
      folders: get().folders.map((f) =>
        f.id === folderId
          ? {
              ...f,
              retentionDays:
                retentionDays != null && retentionDays > 0
                  ? retentionDays
                  : undefined,
            }
          : f
      ),
    });
    await get().persist();
  },

  toggleFeedFolder: async (feedId, folderId) => {
    const feed = get().feeds.find((f) => f.id === feedId);
    if (!feed) return false;
    const next = toggleFeedFolderMembership(feed, folderId);
    if (!next) return false;
    set({
      feeds: get().feeds.map((f) => (f.id === feedId ? next : f)),
    });
    await get().persist();
    return true;
  },

  addTag: async (name, color) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const tag: Tag = {
      id: createId('tag'),
      name: trimmed,
      color,
    };
    set({ tags: [...get().tags, tag] });
    await get().persist();
  },

  renameTag: async (tagId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set({
      tags: get().tags.map((t) => (t.id === tagId ? { ...t, name: trimmed } : t)),
    });
    await get().persist();
  },

  removeTag: async (tagId) => {
    set({
      tags: get().tags.filter((t) => t.id !== tagId),
      feeds: get().feeds.map((f) => ({
        ...f,
        tagIds: f.tagIds.filter((id) => id !== tagId),
      })),
    });
    await get().persist();
  },

  assignTagsToFeed: async (feedId, tagIds) => {
    set({
      feeds: get().feeds.map((f) =>
        f.id === feedId ? { ...f, tagIds } : f
      ),
    });
    await get().persist();
  },

  importOpmlFeeds: async (feedInputs, mode) => {
    const capped = capFeedInputs(feedInputs, mode);
    const { valid, skipped } = filterValidFeedInputs(capped, feedUrlOptions());
    if (valid.length === 0) return { added: 0, skipped };

    if (mode === 'replace') {
      const folderNames = [
        ...new Set(
          valid.map((f) => f.folderName ?? 'Inbox').filter(Boolean)
        ),
      ];
      const folders: Folder[] = folderNames.map((name, index) => ({
        id: slugifyFolder(name) || createId('folder'),
        name,
        sortOrder: index,
      }));
      const folderIdByName = new Map(folders.map((f) => [f.name, f.id]));
      const feeds: FeedSource[] = valid.map((input) => ({
        id: createId('feed'),
        title: input.title,
        url: input.url,
        siteUrl: input.siteUrl,
        folderIds: normalizeFeedFolderIds([
          folderIdByName.get(input.folderName ?? 'Inbox') ?? folders[0]?.id ?? INBOX_FOLDER_ID,
        ]),
        tagIds: [],
        enabled: true,
      }));
      set({ folders, feeds, items: [] });
      await get().persist();
      return { added: feeds.length, skipped };
    }

    const state = get();
    let folders = [...state.folders];
    let feeds = [...state.feeds];
    const feedsByUrl = new Map(feeds.map((f) => [f.url, f]));
    const folderIdByName = new Map(folders.map((f) => [f.name, f.id]));
    let added = 0;

    for (const input of valid) {
      const folderName = input.folderName ?? 'Inbox';
      let folderId = folderIdByName.get(folderName);
      if (!folderId) {
        const folder: Folder = {
          id: createId('folder'),
          name: folderName,
          sortOrder: folders.length,
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
        folderIds: normalizeFeedFolderIds([folderId]),
        tagIds: [],
        enabled: true,
      };
      feeds.push(feed);
      feedsByUrl.set(input.url, feed);
      added += 1;
    }

    set({ folders, feeds });
    await get().persist();
    return { added, skipped };
  },

  replaceAll: async (payload) => {
    set({
      feeds: payload.feeds,
      items: payload.items,
      folders: payload.folders,
      tags: payload.tags,
    });
    await get().persist();
  },
}));

export function countUnreadInFolder(
  folderId: string,
  feeds: FeedSource[],
  items: FeedItem[]
): number {
  const feedIds = new Set(
    feeds.filter((f) => feedInFolder(f, folderId) && f.enabled).map((f) => f.id)
  );
  return items.filter((i) => feedIds.has(i.feedId) && !i.read).length;
}

export function countUnreadItems(): number {
  const { items, feeds } = useFeedsStore.getState();
  const enabledIds = new Set(feeds.filter((f) => f.enabled).map((f) => f.id));
  return items.filter((i) => enabledIds.has(i.feedId) && !i.read).length;
}
