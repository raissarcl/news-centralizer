import { isGeneralOnly } from '../lib/appMode';
import {
  ensureDefaultSpaces,
  GENERAL_SPACE_ID,
  resolveActiveSpaceId,
} from '../lib/spaces';
import { sortItemsByPublishedDesc } from '../lib/items/sortItems';
import { buildBlob, loadBlob, saveBlob } from './persistence';
import { useFeedsStore } from './feeds';
import { useSettingsStore } from './settings';

/** Serializes all blob writes so feeds/settings updates cannot race. */
let persistChain: Promise<void> = Promise.resolve();

/**
 * Persist the current feeds + settings stores into one blob.
 * Always reads settings from the store at write time so tombstones
 * (removedFeedUrls) and other patches are never overwritten by a stale override.
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
      ),
    );
  };
  persistChain = persistChain.then(run, run);
  return persistChain;
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
    items: sortItemsByPublishedDesc(blob.items),
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
