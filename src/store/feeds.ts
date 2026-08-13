import { create } from 'zustand';
import { InteractionManager } from 'react-native';
import {
  COMPUTING_FEED_CATALOG,
  GENERAL_FEED_CATALOG,
} from '../data/feeds/catalogs';
import { faviconUrlForFeed } from '../lib/favicon';
import {
  addFeedToFolder,
  feedInFolder,
  getFeedFolderIds,
  inboxFolderId,
  isInboxFolderId,
  normalizeFeedFolderIds,
  removeFeedFromFolder,
  toggleFeedFolderMembership,
} from '../lib/feeds/feedFolders';
import {
  applyRefreshOntoCurrent,
  mergeRefreshResults,
  type RefreshFeedBatch,
  shouldRefreshFeed,
} from '../lib/feeds/refreshMerge';
import {
  filterItemsForFeed,
  filterItemsForFolder,
  selectVisibleItems,
} from '../lib/feeds/selectItems';
import { createId } from '../lib/id';
import { normalizeFeedUrl } from '../lib/items/dedupeItems';
import { feedUrlAliases } from '../lib/feeds/feedUrlAliases';
import { sortItemsByPublishedDesc } from '../lib/items/sortItems';
import { applyOpmlImport } from '../lib/opml/importFeeds';
import {
  buildSeedFromCatalog,
  ensureInboxFolder,
  ensureSpaceInboxes,
} from '../lib/opml/seedFromOpml';
import type { OpmlFeedInput } from '../lib/opml';
import {
  applyRetention,
  REFRESH_BACKGROUND_CONCURRENCY,
  REFRESH_CONCURRENCY,
} from '../lib/rss/fetchFeed';
import {
  capFeedInputs,
  filterValidFeedInputs,
} from '../lib/security/importLimits';
import { validateFeedUrl } from '../lib/security/urls';
import { isGeneralOnly } from '../lib/appMode';
import {
  COMPUTING_SPACE_ID,
  ensureDefaultSpaces,
  GENERAL_SPACE_ID,
  getDefaultSpaces,
  resolveActiveSpaceId,
} from '../lib/spaces';
import type { FeedItem, FeedSource, Folder, Space, Tag } from '../types';
import {
  hydrateApp,
  persistApp,
  resolveActiveSpaceFromStores,
} from './persistApp';
import { useSettingsStore } from './settings';
import { useTimelineUiStore } from './timelineUi';

export { filterItemsForFeed, filterItemsForFolder, selectVisibleItems };
export {
  applyRefreshOntoCurrent,
  mergeRefreshResults,
  isFeedFresh,
  isFeedPaused,
  isFeedTooRecentForForce,
  shouldRefreshFeed,
  sortFeedsByRefreshPriority,
  refreshPriorityScore,
  refreshStateAfterFetch,
  FEED_FORCE_MIN_AGE_MS,
  FEED_FRESH_MS,
} from '../lib/feeds/refreshMerge';

async function afterDataChange(): Promise<void> {
  const { syncAndroidWidget } = await import('../lib/widget');
  await syncAndroidWidget();
}

const PROGRESS_THROTTLE_MS = 175;

function createThrottledProgress(
  fn: (done: number, total: number) => void,
  intervalMs = PROGRESS_THROTTLE_MS,
): (done: number, total: number) => void {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { done: number; total: number } | null = null;
  const flush = () => {
    timer = null;
    if (!pending) return;
    last = Date.now();
    fn(pending.done, pending.total);
    pending = null;
  };
  return (done, total) => {
    pending = { done, total };
    const now = Date.now();
    if (now - last >= intervalMs) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      last = now;
      fn(done, total);
      pending = null;
      return;
    }
    if (!timer) {
      timer = setTimeout(flush, intervalMs - (now - last));
    }
  };
}

function persistAfterRefresh(): void {
  void persistApp().then(() => {
    void afterDataChange();
  });
}

function feedUrlOptions() {
  return { allowHttp: useSettingsStore.getState().settings.allowHttpFeeds };
}

function otherSpaceId(activeSpaceId: string, spaces: Space[]): string | null {
  if (isGeneralOnly()) return null;
  const other = spaces.find((s) => s.id !== activeSpaceId);
  return other?.id ?? null;
}

/** Record a deleted feed URL so seed merges do not restore it. */
function rememberRemovedFeedUrl(url: string): void {
  const normalized = normalizeFeedUrl(url);
  if (!normalized) return;
  const settings = useSettingsStore.getState().settings;
  const toAdd = feedUrlAliases(normalized).filter(
    (u) => !settings.removedFeedUrls.includes(u),
  );
  if (toAdd.length === 0) return;
  useSettingsStore.setState({
    settings: {
      ...settings,
      removedFeedUrls: [...settings.removedFeedUrls, ...toAdd],
    },
  });
}

/** Allow a URL to be seeded/added again after the user re-adds it. */
function clearRemovedFeedUrls(urls: string[]): void {
  const toClear = new Set<string>();
  for (const url of urls) {
    const normalized = normalizeFeedUrl(url);
    if (!normalized) continue;
    for (const alias of feedUrlAliases(normalized)) toClear.add(alias);
  }
  if (toClear.size === 0) return;
  const settings = useSettingsStore.getState().settings;
  const next = settings.removedFeedUrls.filter((u) => !toClear.has(u));
  if (next.length === settings.removedFeedUrls.length) return;
  useSettingsStore.setState({
    settings: { ...settings, removedFeedUrls: next },
  });
}

function clearRemovedFeedUrl(url: string): void {
  clearRemovedFeedUrls([url]);
}

function filterSeedFeedsAgainstRemoved(
  feeds: FeedSource[],
  removedFeedUrls: string[],
): FeedSource[] {
  if (removedFeedUrls.length === 0) return feeds;
  const removed = new Set(removedFeedUrls.map((u) => normalizeFeedUrl(u)));
  return feeds.filter((feed) => {
    const aliases = feedUrlAliases(normalizeFeedUrl(feed.url));
    return !aliases.some((u) => removed.has(u));
  });
}

/** Prevent overlapping background warms of the inactive space. */
let backgroundWarmInFlight = false;

export type RefreshProgress = {
  done: number;
  total: number;
};

type FeedsState = {
  spaces: Space[];
  feeds: FeedSource[];
  items: FeedItem[];
  folders: Folder[];
  tags: Tag[];
  hydrated: boolean;
  refreshing: boolean;
  /** Feed IDs currently in-flight during refreshAll / refreshFeed. */
  refreshingFeedIds: string[];
  refreshProgress: RefreshProgress | null;
  hydrate: () => Promise<void>;
  persist: () => Promise<void>;
  seedDefaultsIfNeeded: () => Promise<void>;
  seedGeneralIfNeeded: () => Promise<void>;
  setActiveSpaceId: (spaceId: string) => Promise<void>;
  refreshAll: (options?: {
    force?: boolean;
    /** Skip background warm of the other space (used by the warmer itself). */
    skipWarmOther?: boolean;
  }) => Promise<{ newCount: number; newHeadlines: string[] }>;
  /** Quiet refresh of a space without toggling global refreshing UI. */
  warmSpaceInBackground: (spaceId: string) => Promise<void>;
  refreshFeed: (
    feedId: string,
  ) => Promise<{ newCount: number; newHeadlines: string[] }>;
  markAllReadInFolder: (folderId: string) => Promise<void>;
  purgeItemsByRetention: () => Promise<{ removed: number; remaining: number }>;
  removeReadItems: () => Promise<number>;
  clearAllItems: () => Promise<void>;
  updateFeed: (
    feedId: string,
    patch: Partial<Pick<FeedSource, 'title' | 'url' | 'folderIds' | 'siteUrl'>>,
  ) => Promise<void>;
  toggleFeedEnabled: (feedId: string) => Promise<void>;
  resumeFeed: (feedId: string) => Promise<void>;
  resumeAllPausedFeeds: () => Promise<void>;
  markItemRead: (itemId: string, read?: boolean) => Promise<void>;
  toggleItemStarred: (itemId: string) => Promise<void>;
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
  updateFolderRetention: (
    folderId: string,
    retentionDays: number | null,
  ) => Promise<void>;
  toggleFeedFolder: (feedId: string, folderId: string) => Promise<boolean>;
  addTag: (name: string, color?: string) => Promise<void>;
  renameTag: (tagId: string, name: string) => Promise<void>;
  removeTag: (tagId: string) => Promise<void>;
  assignTagsToFeed: (feedId: string, tagIds: string[]) => Promise<void>;
  importOpmlFeeds: (
    feeds: OpmlFeedInput[],
    mode: 'merge' | 'replace',
  ) => Promise<{ added: number; skipped: number }>;
  replaceAll: (payload: {
    spaces?: Space[];
    feeds: FeedSource[];
    items: FeedItem[];
    folders: Folder[];
    tags: Tag[];
  }) => Promise<void>;
};

export const useFeedsStore = create<FeedsState>((set, get) => ({
  spaces: getDefaultSpaces(),
  feeds: [],
  items: [],
  folders: [],
  tags: [],
  hydrated: false,
  refreshing: false,
  refreshingFeedIds: [],
  refreshProgress: null,

  hydrate: async () => {
    await hydrateApp();
  },

  persist: async () => {
    await persistApp();
  },

  seedDefaultsIfNeeded: async () => {
    if (isGeneralOnly()) return;
    const settings = useSettingsStore.getState().settings;
    // seeded=true means first-run seed already ran (even if user deleted all).
    if (settings.seeded) return;
    const computingFeeds = get().feeds.filter(
      (f) => f.spaceId === COMPUTING_SPACE_ID,
    );
    if (computingFeeds.length > 0) {
      await useSettingsStore.getState().update({ seeded: true });
      return;
    }

    const seeded = buildSeedFromCatalog(
      COMPUTING_FEED_CATALOG,
      COMPUTING_SPACE_ID,
      feedUrlOptions(),
    );
    const seedFeeds = filterSeedFeedsAgainstRemoved(
      seeded.feeds,
      settings.removedFeedUrls,
    );
    const spaces = ensureDefaultSpaces(get().spaces);
    set({
      spaces,
      folders: ensureSpaceInboxes(
        [
          ...get().folders.filter((f) => f.spaceId !== COMPUTING_SPACE_ID),
          ...seeded.folders,
        ],
        spaces,
      ),
      feeds: [
        ...get().feeds.filter((f) => f.spaceId !== COMPUTING_SPACE_ID),
        ...seedFeeds,
      ],
    });
    await useSettingsStore.getState().update({ seeded: true });
  },

  seedGeneralIfNeeded: async () => {
    const settings = useSettingsStore.getState().settings;
    // seededGeneral=true means first-run seed already ran (even if user deleted all).
    if (settings.seededGeneral) return;
    const generalFeeds = get().feeds.filter(
      (f) => f.spaceId === GENERAL_SPACE_ID,
    );
    if (generalFeeds.length > 0) {
      await useSettingsStore.getState().update({ seededGeneral: true });
      return;
    }

    const seeded = buildSeedFromCatalog(
      GENERAL_FEED_CATALOG,
      GENERAL_SPACE_ID,
      feedUrlOptions(),
    );
    const seedFeeds = filterSeedFeedsAgainstRemoved(
      seeded.feeds,
      settings.removedFeedUrls,
    );
    const spaces = ensureDefaultSpaces(get().spaces);
    set({
      spaces,
      folders: ensureSpaceInboxes(
        [
          ...get().folders.filter((f) => f.spaceId !== GENERAL_SPACE_ID),
          ...seeded.folders,
        ],
        spaces,
      ),
      feeds: [
        ...get().feeds.filter((f) => f.spaceId !== GENERAL_SPACE_ID),
        ...seedFeeds,
      ],
    });
    await useSettingsStore.getState().update({ seededGeneral: true });
  },

  setActiveSpaceId: async (spaceId) => {
    const spaces = get().spaces;
    if (!spaces.some((s) => s.id === spaceId)) return;
    if (resolveActiveSpaceFromStores() === spaceId) return;
    useTimelineUiStore.getState().resetTimelineFilters();
    await useSettingsStore.getState().update({ activeSpaceId: spaceId });
    if (useSettingsStore.getState().settings.refreshOnOpen) {
      void get().refreshAll();
    }
  },

  warmSpaceInBackground: async (spaceId) => {
    if (backgroundWarmInFlight) return;
    if (isGeneralOnly()) return;
    const state = get();
    if (!state.spaces.some((s) => s.id === spaceId)) return;

    const now = Date.now();
    const enabledFeeds = state.feeds.filter(
      (f) => f.spaceId === spaceId && shouldRefreshFeed(f, false, now),
    );
    if (enabledFeeds.length === 0) return;

    backgroundWarmInFlight = true;
    const retentionDays = useSettingsStore.getState().settings.retentionDays;
    let applyQueue: Promise<void> = Promise.resolve();
    const onFeedBatch = (batch: RefreshFeedBatch) => {
      applyQueue = applyQueue.then(
        () =>
          new Promise<void>((resolve) => {
            InteractionManager.runAfterInteractions(() => {
              const current = get();
              const { feeds, items } = applyRefreshOntoCurrent(
                current.feeds,
                current.items,
                batch.feedUpdates,
                batch.newItems,
                batch.imagePatches,
                current.folders,
                retentionDays,
              );
              set({ feeds, items });
              resolve();
            });
          }),
      );
    };

    try {
      await mergeRefreshResults(state.feeds, enabledFeeds, state.items, {
        allowHttp: feedUrlOptions().allowHttp,
        now,
        concurrency: REFRESH_BACKGROUND_CONCURRENCY,
        retryOn403: false,
        onFeedBatch,
      });
      await applyQueue;
      persistAfterRefresh();
    } finally {
      backgroundWarmInFlight = false;
    }
  },

  refreshAll: async (options) => {
    const force = options?.force === true;
    const skipWarmOther = options?.skipWarmOther === true;
    const state = get();
    const activeSpaceId = resolveActiveSpaceFromStores();
    const now = Date.now();
    const enabledFeeds = state.feeds.filter(
      (f) => f.spaceId === activeSpaceId && shouldRefreshFeed(f, force, now),
    );
    if (enabledFeeds.length === 0) {
      if (!skipWarmOther) {
        const other = otherSpaceId(activeSpaceId, state.spaces);
        if (other) void get().warmSpaceInBackground(other);
      }
      return { newCount: 0, newHeadlines: [] };
    }

    const inFlightIds = enabledFeeds.map((f) => f.id);
    set({
      refreshing: true,
      refreshingFeedIds: inFlightIds,
      refreshProgress: { done: 0, total: enabledFeeds.length },
    });

    const retentionDays = useSettingsStore.getState().settings.retentionDays;
    let applyQueue: Promise<void> = Promise.resolve();
    let isFirstBatch = true;
    const onFeedBatch = (batch: RefreshFeedBatch) => {
      const first = isFirstBatch;
      isFirstBatch = false;
      applyQueue = applyQueue.then(
        () =>
          new Promise<void>((resolve) => {
            const apply = () => {
              const current = get();
              const completedIds = [...batch.feedUpdates.keys()];
              const { feeds, items } = applyRefreshOntoCurrent(
                current.feeds,
                current.items,
                batch.feedUpdates,
                batch.newItems,
                batch.imagePatches,
                current.folders,
                retentionDays,
              );
              set({
                feeds,
                items,
                refreshingFeedIds: current.refreshingFeedIds.filter(
                  (id) => !completedIds.includes(id),
                ),
              });
              resolve();
            };
            if (first) {
              apply();
            } else {
              InteractionManager.runAfterInteractions(apply);
            }
          }),
      );
    };

    const { newCountBySpace, newHeadlinesBySpace } = await mergeRefreshResults(
      state.feeds,
      enabledFeeds,
      state.items,
      {
        allowHttp: feedUrlOptions().allowHttp,
        now,
        concurrency: REFRESH_CONCURRENCY,
        retryOn403: false,
        onProgress: createThrottledProgress((done, total) =>
          set({ refreshProgress: { done, total } }),
        ),
        onFeedBatch,
      },
    );

    await applyQueue;
    set({
      refreshing: false,
      refreshingFeedIds: [],
      refreshProgress: null,
    });
    persistAfterRefresh();

    if (!skipWarmOther) {
      const other = otherSpaceId(activeSpaceId, get().spaces);
      if (other) void get().warmSpaceInBackground(other);
    }

    return {
      newCount: newCountBySpace[activeSpaceId] ?? 0,
      newHeadlines: newHeadlinesBySpace[activeSpaceId] ?? [],
    };
  },

  refreshFeed: async (feedId) => {
    const state = get();
    const activeSpaceId = resolveActiveSpaceFromStores();
    const feed = state.feeds.find((f) => f.id === feedId);
    if (!feed || !feed.enabled || feed.spaceId !== activeSpaceId)
      return { newCount: 0, newHeadlines: [] as string[] };

    set({
      refreshing: true,
      refreshingFeedIds: [feedId],
      refreshProgress: { done: 0, total: 1 },
    });
    const retentionDays = useSettingsStore.getState().settings.retentionDays;
    let applyQueue: Promise<void> = Promise.resolve();
    const onFeedBatch = (batch: RefreshFeedBatch) => {
      applyQueue = applyQueue.then(() => {
        const current = get();
        const { feeds, items } = applyRefreshOntoCurrent(
          current.feeds,
          current.items,
          batch.feedUpdates,
          batch.newItems,
          batch.imagePatches,
          current.folders,
          retentionDays,
        );
        set({
          feeds,
          items,
          refreshingFeedIds: [],
        });
      });
    };

    const { newCountBySpace, newHeadlinesBySpace } = await mergeRefreshResults(
      state.feeds,
      [feed],
      state.items,
      {
        allowHttp: feedUrlOptions().allowHttp,
        concurrency: 1,
        retryOn403: true,
        onProgress: () => set({ refreshProgress: { done: 1, total: 1 } }),
        onFeedBatch,
      },
    );

    await applyQueue;
    set({
      refreshing: false,
      refreshingFeedIds: [],
      refreshProgress: null,
    });
    persistAfterRefresh();
    return {
      newCount: newCountBySpace[feed.spaceId] ?? 0,
      newHeadlines: newHeadlinesBySpace[feed.spaceId] ?? [],
    };
  },

  markAllReadInFolder: async (folderId) => {
    const feedIds = new Set(
      get()
        .feeds.filter((f) => feedInFolder(f, folderId))
        .map((f) => f.id),
    );
    set({
      items: get().items.map((i) =>
        feedIds.has(i.feedId) ? { ...i, read: true } : i,
      ),
    });
    await persistApp();
    await afterDataChange();
  },

  purgeItemsByRetention: async () => {
    const settings = useSettingsStore.getState().settings;
    const before = get().items.length;
    const nextItems = applyRetention(
      get().items,
      settings.retentionDays,
      get().feeds,
      get().folders,
    );
    set({ items: sortItemsByPublishedDesc(nextItems) });
    await persistApp();
    await afterDataChange();
    return { removed: before - nextItems.length, remaining: nextItems.length };
  },

  removeReadItems: async () => {
    const spaceId = resolveActiveSpaceFromStores();
    const feedIds = new Set(
      get()
        .feeds.filter((f) => f.spaceId === spaceId)
        .map((f) => f.id),
    );
    const before = get().items.filter((i) => feedIds.has(i.feedId)).length;
    const nextItems = get().items.filter((i) => {
      if (!feedIds.has(i.feedId)) return true;
      return !i.read || i.starred;
    });
    const after = nextItems.filter((i) => feedIds.has(i.feedId)).length;
    set({ items: sortItemsByPublishedDesc(nextItems) });
    await persistApp();
    await afterDataChange();
    return before - after;
  },

  clearAllItems: async () => {
    const spaceId = resolveActiveSpaceFromStores();
    const feedIds = new Set(
      get()
        .feeds.filter((f) => f.spaceId === spaceId)
        .map((f) => f.id),
    );
    set({
      items: get().items.filter((i) => !feedIds.has(i.feedId)),
    });
    await persistApp();
    await afterDataChange();
  },

  updateFeed: async (feedId, patch) => {
    if (patch.url) {
      const validated = validateFeedUrl(patch.url, feedUrlOptions());
      if (!validated.ok) return;
    }
    const feed = get().feeds.find((f) => f.id === feedId);
    if (!feed) return;
    const normalizedPatch = {
      ...patch,
      ...(patch.folderIds
        ? { folderIds: normalizeFeedFolderIds(patch.folderIds, feed.spaceId) }
        : {}),
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
                      patch.url ?? f.url,
                    )
                  : f.favicon,
            }
          : f,
      ),
    });
    await persistApp();
  },

  toggleFeedEnabled: async (feedId) => {
    set({
      feeds: get().feeds.map((f) =>
        f.id === feedId ? { ...f, enabled: !f.enabled } : f,
      ),
    });
    await persistApp();
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
          : f,
      ),
    });
    await persistApp();
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
    await persistApp();
  },

  markItemRead: async (itemId, read = true) => {
    set({
      items: get().items.map((i) => (i.id === itemId ? { ...i, read } : i)),
    });
    await persistApp();
  },

  toggleItemStarred: async (itemId) => {
    set({
      items: get().items.map((i) =>
        i.id === itemId ? { ...i, starred: !i.starred } : i,
      ),
    });
    await persistApp();
  },

  addFeed: async (input) => {
    const validated = validateFeedUrl(input.url, feedUrlOptions());
    if (!validated.ok) return 'invalid';

    const href = validated.url.href;
    const spaceId = resolveActiveSpaceFromStores();
    const folder = get().folders.find((f) => f.id === input.folderId);
    const feedSpaceId = folder?.spaceId ?? spaceId;

    const existing = get().feeds.find(
      (f) => f.url === href && f.spaceId === feedSpaceId,
    );
    if (existing) {
      if (feedInFolder(existing, input.folderId)) return 'duplicate';
      set({
        feeds: get().feeds.map((f) =>
          f.id === existing.id ? addFeedToFolder(f, input.folderId) : f,
        ),
      });
      clearRemovedFeedUrl(href);
      await persistApp();
      return 'ok';
    }

    const feed: FeedSource = {
      id: createId('feed'),
      title: input.title.trim() || input.url,
      url: href,
      siteUrl: input.siteUrl,
      favicon: faviconUrlForFeed(input.siteUrl, href),
      spaceId: feedSpaceId,
      folderIds: normalizeFeedFolderIds([input.folderId], feedSpaceId),
      tagIds: input.tagIds ?? [],
      enabled: true,
    };
    set({ feeds: [...get().feeds, feed] });
    clearRemovedFeedUrl(href);
    await persistApp();
    return 'ok';
  },

  removeFeed: async (feedId) => {
    const removed = get().feeds.find((f) => f.id === feedId);
    set({
      feeds: get().feeds.filter((f) => f.id !== feedId),
      items: get().items.filter((i) => i.feedId !== feedId),
    });
    if (removed) {
      rememberRemovedFeedUrl(removed.url);
    }
    await persistApp();
  },

  addFolder: async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const spaceId = resolveActiveSpaceFromStores();
    const folder: Folder = {
      id: createId('folder'),
      name: trimmed,
      spaceId,
      sortOrder: get().folders.filter((f) => f.spaceId === spaceId).length,
    };
    set({ folders: [...get().folders, folder] });
    await persistApp();
  },

  renameFolder: async (folderId, name) => {
    const trimmed = name.trim();
    if (!trimmed || isInboxFolderId(folderId)) return;
    set({
      folders: get().folders.map((f) =>
        f.id === folderId ? { ...f, name: trimmed } : f,
      ),
    });
    await persistApp();
  },

  removeFolder: async (folderId) => {
    if (isInboxFolderId(folderId)) return;
    const folder = get().folders.find((f) => f.id === folderId);
    if (!folder) return;
    const inboxId = inboxFolderId(folder.spaceId);
    const folders = ensureInboxFolder(
      get().folders.filter((f) => f.id !== folderId),
      folder.spaceId,
    );
    set({
      folders,
      feeds: get().feeds.map((f) => {
        if (!feedInFolder(f, folderId)) return f;
        const next = removeFeedFromFolder(f, folderId);
        if (getFeedFolderIds(next).length > 0) return next;
        return addFeedToFolder(f, inboxId);
      }),
    });
    await persistApp();
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
          : f,
      ),
    });
    await persistApp();
  },

  toggleFeedFolder: async (feedId, folderId) => {
    const feed = get().feeds.find((f) => f.id === feedId);
    const folder = get().folders.find((f) => f.id === folderId);
    if (!feed || !folder) return false;
    if (folder.spaceId !== feed.spaceId) return false;
    const next = toggleFeedFolderMembership(feed, folderId);
    if (!next) return false;
    set({
      feeds: get().feeds.map((f) => (f.id === feedId ? next : f)),
    });
    await persistApp();
    return true;
  },

  addTag: async (name, color) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const spaceId = resolveActiveSpaceFromStores();
    const tag: Tag = {
      id: createId('tag'),
      name: trimmed,
      spaceId,
      color,
    };
    set({ tags: [...get().tags, tag] });
    await persistApp();
  },

  renameTag: async (tagId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set({
      tags: get().tags.map((t) =>
        t.id === tagId ? { ...t, name: trimmed } : t,
      ),
    });
    await persistApp();
  },

  removeTag: async (tagId) => {
    set({
      tags: get().tags.filter((t) => t.id !== tagId),
      feeds: get().feeds.map((f) => ({
        ...f,
        tagIds: f.tagIds.filter((id) => id !== tagId),
      })),
    });
    await persistApp();
  },

  assignTagsToFeed: async (feedId, tagIds) => {
    const feed = get().feeds.find((f) => f.id === feedId);
    if (!feed) return;
    const allowed = new Set(
      get()
        .tags.filter((tag) => tag.spaceId === feed.spaceId)
        .map((tag) => tag.id),
    );
    const nextTagIds = tagIds.filter((id) => allowed.has(id));
    set({
      feeds: get().feeds.map((f) =>
        f.id === feedId ? { ...f, tagIds: nextTagIds } : f,
      ),
    });
    await persistApp();
  },

  importOpmlFeeds: async (feedInputs, mode) => {
    const capped = capFeedInputs(feedInputs, mode);
    const { valid, skipped } = filterValidFeedInputs(capped, feedUrlOptions());
    if (valid.length === 0) return { added: 0, skipped };

    const spaceId = resolveActiveSpaceFromStores();
    const next = applyOpmlImport(
      {
        folders: get().folders,
        feeds: get().feeds,
        items: get().items,
        tags: get().tags,
      },
      valid,
      mode,
      spaceId,
    );
    set({
      folders: next.folders,
      feeds: next.feeds,
      items: next.items,
      tags: next.tags,
    });
    clearRemovedFeedUrls(valid.map((f) => f.url));
    await persistApp();
    return { added: next.added, skipped };
  },

  replaceAll: async (payload) => {
    set({
      spaces: ensureDefaultSpaces(payload.spaces ?? get().spaces),
      feeds: payload.feeds,
      items: payload.items,
      folders: payload.folders,
      tags: payload.tags,
    });
    await persistApp();
  },
}));

export function countUnreadInFolder(
  folderId: string,
  feeds: FeedSource[],
  items: FeedItem[],
): number {
  const feedIds = new Set(
    feeds
      .filter((f) => feedInFolder(f, folderId) && f.enabled)
      .map((f) => f.id),
  );
  return items.filter((i) => feedIds.has(i.feedId) && !i.read).length;
}

export function countUnreadItems(spaceId?: string): number {
  const { items, feeds } = useFeedsStore.getState();
  const activeSpaceId =
    spaceId ??
    resolveActiveSpaceId(
      useSettingsStore.getState().settings.activeSpaceId,
      useFeedsStore.getState().spaces,
    );
  const enabledIds = new Set(
    feeds
      .filter((f) => f.enabled && f.spaceId === activeSpaceId)
      .map((f) => f.id),
  );
  return items.filter((i) => enabledIds.has(i.feedId) && !i.read).length;
}

export function feedsInSpace(
  feeds: FeedSource[],
  spaceId: string,
): FeedSource[] {
  return feeds.filter((f) => f.spaceId === spaceId);
}

export function foldersInSpace(folders: Folder[], spaceId: string): Folder[] {
  return folders.filter((f) => f.spaceId === spaceId);
}

export function tagsInSpace(tags: Tag[], spaceId: string): Tag[] {
  return tags.filter((t) => t.spaceId === spaceId);
}
