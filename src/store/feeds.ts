import { create } from "zustand";
import { DEFAULT_FEEDS_OPML } from "../data/defaultFeedsOpml";
import { DEFAULT_GENERAL_FEEDS_OPML } from "../data/generalFeedsSeed";
import { faviconUrlForFeed } from "../lib/favicon";
import {
  addFeedToFolder,
  feedInFolder,
  getFeedFolderIds,
  inboxFolderId,
  isInboxFolderId,
  normalizeFeedFolderIds,
  removeFeedFromFolder,
  toggleFeedFolderMembership,
} from "../lib/feeds/feedFolders";
import {
  filterItemsForFeed,
  filterItemsForFolder,
  selectVisibleItems,
} from "../lib/feeds/selectItems";
import { createId } from "../lib/id";
import { normalizeFeedUrl, normalizeItemLink } from "../lib/items/dedupeItems";
import { sortItemsByPublishedDesc } from "../lib/items/sortItems";
import { flattenOpmlFeeds, parseOpml, type OpmlFeedInput } from "../lib/opml";
import {
  applyRetention,
  fetchFeed,
  mapPool,
  REFRESH_CONCURRENCY,
} from "../lib/rss/fetchFeed";
import {
  capFeedInputs,
  filterValidFeedInputs,
} from "../lib/security/importLimits";
import { validateFeedUrl } from "../lib/security/urls";
import { isGeneralOnly } from "../lib/appMode";
import {
  COMPUTING_SPACE_ID,
  ensureDefaultSpaces,
  GENERAL_SPACE_ID,
  getDefaultSpaces,
  resolveActiveSpaceId,
} from "../lib/spaces";
import type {
  FeedItem,
  FeedSource,
  Folder,
  Settings,
  Space,
  Tag,
  TimelineFilter,
  TimelinePeriod,
} from "../types";
import { buildBlob, loadBlob, saveBlob } from "./persistence";
import { useSettingsStore } from "./settings";

export { filterItemsForFeed, filterItemsForFolder, selectVisibleItems };

async function afterDataChange(): Promise<void> {
  const { syncAndroidWidget } = await import("../lib/widget");
  await syncAndroidWidget();
}

const REFRESH_FAIL_THRESHOLD = 3;
const REFRESH_PAUSE_MS = 15 * 60 * 1000;
const INBOX_FOLDER_NAME = "Caixa de entrada";

function feedUrlOptions() {
  return { allowHttp: useSettingsStore.getState().settings.allowHttpFeeds };
}

function isFeedPaused(feed: FeedSource): boolean {
  if (!feed.refreshPausedUntil) return false;
  return new Date(feed.refreshPausedUntil).getTime() > Date.now();
}

function refreshStateAfterFetch(
  feed: FeedSource,
  error?: string,
): Pick<FeedSource, "refreshFailCount" | "refreshPausedUntil"> {
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
  return {
    refreshFailCount: failCount,
    refreshPausedUntil: feed.refreshPausedUntil,
  };
}

function getActiveSpaceId(): string {
  const settings = useSettingsStore.getState().settings;
  const spaces = useFeedsStore.getState().spaces;
  return resolveActiveSpaceId(settings.activeSpaceId, spaces);
}

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
  seedGeneralIfNeeded: () => Promise<void>;
  setActiveSpaceId: (spaceId: string) => Promise<void>;
  refreshAll: () => Promise<{ newCount: number; newHeadlines: string[] }>;
  refreshFeed: (
    feedId: string,
  ) => Promise<{ newCount: number; newHeadlines: string[] }>;
  markAllReadInFolder: (folderId: string) => Promise<void>;
  purgeItemsByRetention: () => Promise<{ removed: number; remaining: number }>;
  removeReadItems: () => Promise<number>;
  clearAllItems: () => Promise<void>;
  updateFeed: (
    feedId: string,
    patch: Partial<Pick<FeedSource, "title" | "url" | "folderIds" | "siteUrl">>,
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
  resetTimelineFilters: () => void;
  addFeed: (input: {
    title: string;
    url: string;
    siteUrl?: string;
    folderId: string;
    tagIds?: string[];
  }) => Promise<"ok" | "invalid" | "duplicate">;
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
    mode: "merge" | "replace",
  ) => Promise<{ added: number; skipped: number }>;
  replaceAll: (payload: {
    spaces?: Space[];
    feeds: FeedSource[];
    items: FeedItem[];
    folders: Folder[];
    tags: Tag[];
  }) => Promise<void>;
};

function ensureInboxFolder(folders: Folder[], spaceId: string): Folder[] {
  const id = inboxFolderId(spaceId);
  if (folders.some((f) => f.id === id)) {
    return folders.map((f) =>
      f.id === id ? { ...f, name: INBOX_FOLDER_NAME, spaceId } : f,
    );
  }
  return [{ id, name: INBOX_FOLDER_NAME, spaceId, sortOrder: -1 }, ...folders];
}

function ensureSpaceInboxes(folders: Folder[], spaces: Space[]): Folder[] {
  let next = [...folders];
  for (const space of spaces) {
    next = ensureInboxFolder(next, space.id);
  }
  return next;
}

function slugifyFolder(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildSeedFromOpml(
  opml: string,
  spaceId: string,
): {
  folders: Folder[];
  feeds: FeedSource[];
} {
  const outlines = parseOpml(opml);
  const feedInputs = flattenOpmlFeeds(outlines).filter(
    (input) => validateFeedUrl(input.url, feedUrlOptions()).ok,
  );
  const folderNames = [
    ...new Set(
      feedInputs.map((f) => f.folderName).filter((n): n is string => !!n),
    ),
  ];
  const folders: Folder[] = folderNames.map((name, index) => {
    const base = slugifyFolder(name) || `folder-${index}`;
    const id = `${spaceId}-${base}`;
    const isPapers = name.toLowerCase().includes("papers");
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
    const folderNameLower = input.folderName?.toLowerCase() ?? "";
    const enabledFromAttr = input.enabled;
    const enabled =
      enabledFromAttr !== undefined
        ? enabledFromAttr
        : !folderNameLower.includes("papers");
    return {
      id: createId("feed"),
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
 * Adds feeds/folders from the default Geral OPML that are missing on this
 * install (by URL). Does not remove user-added sources or change toggles.
 */
function mergeMissingSeedFeeds(
  existingFolders: Folder[],
  existingFeeds: FeedSource[],
  spaceId: string,
  opml: string,
): { folders: Folder[]; feeds: FeedSource[]; added: number } {
  const seeded = buildSeedFromOpml(opml, spaceId);
  let folders = [...existingFolders];
  const existingFolderIds = new Set(
    folders.filter((f) => f.spaceId === spaceId).map((f) => f.id),
  );
  const folderIdByName = new Map(
    folders.filter((f) => f.spaceId === spaceId).map((f) => [f.name, f.id]),
  );

  for (const folder of seeded.folders) {
    if (isInboxFolderId(folder.id)) continue;
    if (existingFolderIds.has(folder.id) || folderIdByName.has(folder.name)) {
      continue;
    }
    folders.push(folder);
    existingFolderIds.add(folder.id);
    folderIdByName.set(folder.name, folder.id);
  }
  folders = ensureInboxFolder(folders, spaceId);

  const existingUrls = new Set(
    existingFeeds
      .filter((f) => f.spaceId === spaceId)
      .map((f) => normalizeFeedUrl(f.url)),
  );
  const inboxId = inboxFolderId(spaceId);
  const toAdd: FeedSource[] = [];

  for (const feed of seeded.feeds) {
    if (existingUrls.has(normalizeFeedUrl(feed.url))) continue;
    const seedFolderId = feed.folderIds[0] ?? inboxId;
    const seedFolderName = seeded.folders.find(
      (f) => f.id === seedFolderId,
    )?.name;
    const folderId =
      (existingFolderIds.has(seedFolderId) ? seedFolderId : undefined) ??
      (seedFolderName ? folderIdByName.get(seedFolderName) : undefined) ??
      inboxId;
    toAdd.push({
      ...feed,
      id: createId("feed"),
      folderIds: normalizeFeedFolderIds([folderId], spaceId),
    });
    existingUrls.add(normalizeFeedUrl(feed.url));
  }

  return {
    folders,
    feeds: [...existingFeeds, ...toAdd],
    added: toAdd.length,
  };
}

async function mergeRefreshResults(
  allFeeds: FeedSource[],
  enabledFeeds: FeedSource[],
  existingItems: FeedItem[],
  folders: Folder[],
  onProgress?: (done: number, total: number) => void,
): Promise<{
  feeds: FeedSource[];
  items: FeedItem[];
  newCountBySpace: Record<string, number>;
  newHeadlinesBySpace: Record<string, string[]>;
}> {
  let done = 0;
  const feedById = new Map(allFeeds.map((f) => [f.id, f]));
  const existingById = new Map(existingItems.map((i) => [i.id, i]));
  // Dedupe links within the same space only — allows the same story in both spaces.
  const existingBySpaceLink = new Map<string, FeedItem>();
  for (const item of existingItems) {
    const linkKey = normalizeItemLink(item.link);
    if (!linkKey) continue;
    const spaceId = feedById.get(item.feedId)?.spaceId;
    if (!spaceId) continue;
    existingBySpaceLink.set(`${spaceId}::${linkKey}`, item);
  }
  const feedUpdates = new Map<string, FeedSource>();
  const newCountBySpace: Record<string, number> = {};
  const newHeadlinesBySpace: Record<string, string[]> = {};

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
          const spaceLinkKey = `${feed.spaceId}::${linkKey}`;
          const dupe = existingBySpaceLink.get(spaceLinkKey);
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
          if (linkKey) {
            existingBySpaceLink.set(`${feed.spaceId}::${linkKey}`, newItem);
          }
          newCountBySpace[feed.spaceId] = (newCountBySpace[feed.spaceId] ?? 0) + 1;
          const headlines = newHeadlinesBySpace[feed.spaceId] ?? [];
          if (headlines.length < 5) {
            headlines.push(entry.title);
            newHeadlinesBySpace[feed.spaceId] = headlines;
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
    folders,
  );

  return {
    feeds: nextFeeds,
    items: nextItems,
    newCountBySpace,
    newHeadlinesBySpace,
  };
}

export const useFeedsStore = create<FeedsState>((set, get) => ({
  spaces: getDefaultSpaces(),
  feeds: [],
  items: [],
  folders: [],
  tags: [],
  hydrated: false,
  refreshing: false,
  refreshProgress: null,
  timelineFilter: "all",
  timelinePeriod: "all",
  searchQuery: "",
  selectedTagId: null,
  selectedFolderId: null,
  selectedFeedIds: [],

  hydrate: async () => {
    const blob = await loadBlob();
    set({
      spaces: ensureDefaultSpaces(blob.spaces),
      feeds: blob.feeds,
      items: sortItemsByPublishedDesc(blob.items),
      folders: blob.folders,
      tags: blob.tags,
      hydrated: true,
    });
  },

  persist: async (settings) => {
    const s = settings ?? useSettingsStore.getState().settings;
    const { spaces, feeds, items, folders, tags } = get();
    await saveBlob(buildBlob(spaces, feeds, items, folders, tags, s));
  },

  seedDefaultsIfNeeded: async () => {
    if (isGeneralOnly()) return;
    const settings = useSettingsStore.getState().settings;
    const computingFeeds = get().feeds.filter(
      (f) => f.spaceId === COMPUTING_SPACE_ID,
    );
    if (settings.seeded || computingFeeds.length > 0) return;

    const { folders, feeds } = buildSeedFromOpml(
      DEFAULT_FEEDS_OPML,
      COMPUTING_SPACE_ID,
    );
    const spaces = ensureDefaultSpaces(get().spaces);
    set({
      spaces,
      folders: ensureSpaceInboxes(
        [
          ...get().folders.filter((f) => f.spaceId !== COMPUTING_SPACE_ID),
          ...folders,
        ],
        spaces,
      ),
      feeds: [
        ...get().feeds.filter((f) => f.spaceId !== COMPUTING_SPACE_ID),
        ...feeds,
      ],
    });
    await useSettingsStore.getState().update({ seeded: true });
    await get().persist({ ...settings, seeded: true });
  },

  seedGeneralIfNeeded: async () => {
    const settings = useSettingsStore.getState().settings;
    const generalFeeds = get().feeds.filter(
      (f) => f.spaceId === GENERAL_SPACE_ID,
    );

    if (!settings.seededGeneral && generalFeeds.length === 0) {
      const { folders, feeds } = buildSeedFromOpml(
        DEFAULT_GENERAL_FEEDS_OPML,
        GENERAL_SPACE_ID,
      );
      const spaces = ensureDefaultSpaces(get().spaces);
      set({
        spaces,
        folders: ensureSpaceInboxes(
          [
            ...get().folders.filter((f) => f.spaceId !== GENERAL_SPACE_ID),
            ...folders,
          ],
          spaces,
        ),
        feeds: [
          ...get().feeds.filter((f) => f.spaceId !== GENERAL_SPACE_ID),
          ...feeds,
        ],
      });
      await useSettingsStore.getState().update({ seededGeneral: true });
      await get().persist({ ...settings, seededGeneral: true });
      return;
    }

    if (!settings.seededGeneral) {
      await useSettingsStore.getState().update({ seededGeneral: true });
    }

    // Catalog grows over time — merge missing seed URLs without wiping user feeds.
    const merged = mergeMissingSeedFeeds(
      get().folders,
      get().feeds,
      GENERAL_SPACE_ID,
      DEFAULT_GENERAL_FEEDS_OPML,
    );
    if (merged.added > 0) {
      set({ folders: merged.folders, feeds: merged.feeds });
      await get().persist();
    }
  },

  setActiveSpaceId: async (spaceId) => {
    const spaces = get().spaces;
    if (!spaces.some((s) => s.id === spaceId)) return;
    if (getActiveSpaceId() === spaceId) return;
    get().resetTimelineFilters();
    await useSettingsStore.getState().update({ activeSpaceId: spaceId });
    // Feeds of each space refresh only while that space is active.
    if (useSettingsStore.getState().settings.refreshOnOpen) {
      await get().refreshAll();
    }
  },

  resetTimelineFilters: () =>
    set({
      timelineFilter: "all",
      timelinePeriod: "all",
      searchQuery: "",
      selectedTagId: null,
      selectedFolderId: null,
      selectedFeedIds: [],
    }),

  refreshAll: async () => {
    const state = get();
    const activeSpaceId = getActiveSpaceId();
    const enabledFeeds = state.feeds.filter(
      (f) =>
        f.spaceId === activeSpaceId && f.enabled && !isFeedPaused(f),
    );
    if (enabledFeeds.length === 0) return { newCount: 0, newHeadlines: [] };

    set({
      refreshing: true,
      refreshProgress: { done: 0, total: enabledFeeds.length },
    });

    const { feeds, items, newCountBySpace, newHeadlinesBySpace } =
      await mergeRefreshResults(
        state.feeds,
        enabledFeeds,
        state.items,
        state.folders,
        (done, total) => set({ refreshProgress: { done, total } }),
      );

    set({
      feeds,
      items,
      refreshing: false,
      refreshProgress: null,
    });
    await get().persist();
    await afterDataChange();

    return {
      newCount: newCountBySpace[activeSpaceId] ?? 0,
      newHeadlines: newHeadlinesBySpace[activeSpaceId] ?? [],
    };
  },

  refreshFeed: async (feedId) => {
    const state = get();
    const activeSpaceId = getActiveSpaceId();
    const feed = state.feeds.find((f) => f.id === feedId);
    if (!feed || !feed.enabled || feed.spaceId !== activeSpaceId)
      return { newCount: 0, newHeadlines: [] as string[] };

    set({ refreshing: true, refreshProgress: { done: 0, total: 1 } });
    const { feeds, items, newCountBySpace, newHeadlinesBySpace } =
      await mergeRefreshResults(
        state.feeds,
        [feed],
        state.items,
        state.folders,
        () => set({ refreshProgress: { done: 1, total: 1 } }),
      );
    set({ feeds, items, refreshing: false, refreshProgress: null });
    await get().persist();
    await afterDataChange();
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
      get().folders,
    );
    set({ items: sortItemsByPublishedDesc(nextItems) });
    await get().persist();
    await afterDataChange();
    return { removed: before - nextItems.length, remaining: nextItems.length };
  },

  removeReadItems: async () => {
    const spaceId = getActiveSpaceId();
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
    await get().persist();
    await afterDataChange();
    return before - after;
  },

  clearAllItems: async () => {
    const spaceId = getActiveSpaceId();
    const feedIds = new Set(
      get()
        .feeds.filter((f) => f.spaceId === spaceId)
        .map((f) => f.id),
    );
    set({
      items: get().items.filter((i) => !feedIds.has(i.feedId)),
    });
    await get().persist();
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
    await get().persist();
  },

  toggleFeedEnabled: async (feedId) => {
    set({
      feeds: get().feeds.map((f) =>
        f.id === feedId ? { ...f, enabled: !f.enabled } : f,
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
          : f,
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
      items: get().items.map((i) => (i.id === itemId ? { ...i, read } : i)),
    });
    await get().persist();
  },

  toggleItemStarred: async (itemId) => {
    set({
      items: get().items.map((i) =>
        i.id === itemId ? { ...i, starred: !i.starred } : i,
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
    if (!validated.ok) return "invalid";

    const href = validated.url.href;
    const spaceId = getActiveSpaceId();
    const folder = get().folders.find((f) => f.id === input.folderId);
    const feedSpaceId = folder?.spaceId ?? spaceId;

    const existing = get().feeds.find(
      (f) => f.url === href && f.spaceId === feedSpaceId,
    );
    if (existing) {
      if (feedInFolder(existing, input.folderId)) return "duplicate";
      set({
        feeds: get().feeds.map((f) =>
          f.id === existing.id ? addFeedToFolder(f, input.folderId) : f,
        ),
      });
      await get().persist();
      return "ok";
    }

    const feed: FeedSource = {
      id: createId("feed"),
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
    await get().persist();
    return "ok";
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
    const spaceId = getActiveSpaceId();
    const folder: Folder = {
      id: createId("folder"),
      name: trimmed,
      spaceId,
      sortOrder: get().folders.filter((f) => f.spaceId === spaceId).length,
    };
    set({ folders: [...get().folders, folder] });
    await get().persist();
  },

  renameFolder: async (folderId, name) => {
    const trimmed = name.trim();
    if (!trimmed || isInboxFolderId(folderId)) return;
    set({
      folders: get().folders.map((f) =>
        f.id === folderId ? { ...f, name: trimmed } : f,
      ),
    });
    await get().persist();
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
          : f,
      ),
    });
    await get().persist();
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
    await get().persist();
    return true;
  },

  addTag: async (name, color) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const spaceId = getActiveSpaceId();
    const tag: Tag = {
      id: createId("tag"),
      name: trimmed,
      spaceId,
      color,
    };
    set({ tags: [...get().tags, tag] });
    await get().persist();
  },

  renameTag: async (tagId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set({
      tags: get().tags.map((t) =>
        t.id === tagId ? { ...t, name: trimmed } : t,
      ),
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
    await get().persist();
  },

  importOpmlFeeds: async (feedInputs, mode) => {
    const capped = capFeedInputs(feedInputs, mode);
    const { valid, skipped } = filterValidFeedInputs(capped, feedUrlOptions());
    if (valid.length === 0) return { added: 0, skipped };

    const spaceId = getActiveSpaceId();

    if (mode === "replace") {
      const folderNames = [
        ...new Set(valid.map((f) => f.folderName ?? "Inbox").filter(Boolean)),
      ];
      const otherFolders = get().folders.filter((f) => f.spaceId !== spaceId);
      const otherFeeds = get().feeds.filter((f) => f.spaceId !== spaceId);
      const otherFeedIds = new Set(otherFeeds.map((f) => f.id));
      const folders: Folder[] = ensureInboxFolder(
        folderNames.map((name, index) => ({
          id: `${spaceId}-${slugifyFolder(name) || createId("folder")}`,
          name,
          spaceId,
          sortOrder: index,
        })),
        spaceId,
      );
      const folderIdByName = new Map(folders.map((f) => [f.name, f.id]));
      const inboxId = inboxFolderId(spaceId);
      const feeds: FeedSource[] = valid.map((input) => ({
        id: createId("feed"),
        title: input.title,
        url: input.url,
        siteUrl: input.siteUrl,
        spaceId,
        folderIds: normalizeFeedFolderIds(
          [
            folderIdByName.get(input.folderName ?? "Inbox") ??
              folders[0]?.id ??
              inboxId,
          ],
          spaceId,
        ),
        tagIds: [],
        enabled: input.enabled !== false,
      }));
      set({
        folders: [...otherFolders, ...folders],
        feeds: [...otherFeeds, ...feeds],
        items: get().items.filter((i) => otherFeedIds.has(i.feedId)),
        tags: get().tags.filter((t) => t.spaceId !== spaceId),
      });
      await get().persist();
      return { added: feeds.length, skipped };
    }

    const state = get();
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
      const folderName = input.folderName ?? "Inbox";
      let folderId = folderIdByName.get(folderName);
      if (!folderId) {
        const folder: Folder = {
          id: createId("folder"),
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
        id: createId("feed"),
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

    set({ folders, feeds });
    await get().persist();
    return { added, skipped };
  },

  replaceAll: async (payload) => {
    set({
      spaces: ensureDefaultSpaces(payload.spaces ?? get().spaces),
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
