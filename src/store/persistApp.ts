import { isGeneralOnly } from '../lib/appMode';
import {
  ensureDefaultSpaces,
  GENERAL_SPACE_ID,
  resolveActiveSpaceId,
} from '../lib/spaces';
import { hydrateItemsFromMarks } from '../lib/items/itemMarks';
import type {
  FeedItem,
  FeedSource,
  Folder,
  Settings,
  SlimStarredItem,
  Space,
  Tag,
} from '../types';
import { buildBlob, loadBlob, PersistError, saveBlob } from './persistence';
import { useFeedsStore } from './feeds';
import { useSettingsStore } from './settings';

export { PersistError } from './persistence';

/** Serializes all blob writes so feeds/settings updates cannot race. */
let persistChain: Promise<void> = Promise.resolve();

type PersistFailureListener = (err: unknown) => void;
let persistFailureListener: PersistFailureListener | null = null;

export function setPersistFailureListener(
  listener: PersistFailureListener | null,
): void {
  persistFailureListener = listener;
}

type PersistedFeedsSlice = {
  spaces: Space[];
  feeds: FeedSource[];
  items: FeedItem[];
  readKeys: string[];
  starredItems: SlimStarredItem[];
  folders: Folder[];
  tags: Tag[];
};

export type PersistedStoresSnapshot = {
  feeds: PersistedFeedsSlice;
  settings: Settings;
};

export function snapshotPersistedStores(): PersistedStoresSnapshot {
  const feedsState = useFeedsStore.getState();
  return {
    feeds: {
      spaces: feedsState.spaces,
      feeds: feedsState.feeds,
      items: feedsState.items,
      readKeys: feedsState.readKeys,
      starredItems: feedsState.starredItems,
      folders: feedsState.folders,
      tags: feedsState.tags,
    },
    settings: useSettingsStore.getState().settings,
  };
}

export function restorePersistedStores(
  snapshot: PersistedStoresSnapshot,
): void {
  useFeedsStore.setState(snapshot.feeds);
  useSettingsStore.setState({ settings: snapshot.settings });
}

/**
 * Persist the current feeds + settings stores into one blob.
 * Always reads settings from the store at write time so tombstones
 * (removedFeedUrls / disabledFeedUrls) and other patches are never overwritten
 * by a stale override.
 */
export function persistApp(): Promise<void> {
  const run = async () => {
    const feedsState = useFeedsStore.getState();
    const settings = useSettingsStore.getState().settings;
    await saveBlob(
      buildBlob(
        feedsState.spaces,
        feedsState.feeds,
        feedsState.items,
        feedsState.folders,
        feedsState.tags,
        settings,
        feedsState.readKeys,
        feedsState.starredItems,
      ),
    );
  };
  persistChain = persistChain.then(run, run).catch((err) => {
    if (err instanceof PersistError) {
      console.warn('[persistApp]', err.message, err);
    } else {
      console.warn('[persistApp]', err);
    }
    throw err;
  });
  return persistChain;
}

export async function persistAppOrRollback(
  snapshot: PersistedStoresSnapshot,
): Promise<void> {
  try {
    await persistApp();
  } catch (err) {
    restorePersistedStores(snapshot);
    persistFailureListener?.(err);
    throw err;
  }
}

export async function runPersistedMutation(mutate: () => void): Promise<void> {
  const snapshot = snapshotPersistedStores();
  mutate();
  await persistAppOrRollback(snapshot);
}

/** Single load of the persisted blob into both stores. */
export async function hydrateApp(): Promise<void> {
  const blob = await loadBlob();
  const settings = isGeneralOnly()
    ? { ...blob.settings, activeSpaceId: GENERAL_SPACE_ID }
    : blob.settings;

  useSettingsStore.setState({ settings, hydrated: true });
  useFeedsStore.setState({
    spaces: ensureDefaultSpaces(blob.spaces),
    feeds: blob.feeds,
    items: hydrateItemsFromMarks(blob.starredItems, blob.readKeys, blob.feeds),
    readKeys: blob.readKeys,
    starredItems: blob.starredItems,
    folders: blob.folders,
    tags: blob.tags,
    hydrated: true,
  });
}

export function resolveActiveSpaceFromStores(): string {
  const settings = useSettingsStore.getState().settings;
  const spaces = useFeedsStore.getState().spaces;
  return resolveActiveSpaceId(settings.activeSpaceId, spaces);
}
