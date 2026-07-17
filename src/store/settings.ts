import { create } from 'zustand';
import { isGeneralOnly } from '../lib/appMode';
import { GENERAL_SPACE_ID } from '../lib/spaces';
import { DEFAULT_SETTINGS, type Settings } from '../types';
import { buildBlob, loadBlob, saveBlob } from './persistence';
import { useFeedsStore } from './feeds';

type SettingsState = {
  settings: Settings;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  hydrated: false,
  hydrate: async () => {
    const blob = await loadBlob();
    const settings = isGeneralOnly()
      ? { ...blob.settings, activeSpaceId: GENERAL_SPACE_ID }
      : blob.settings;
    set({ settings, hydrated: true });
  },
  update: async (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    const feedsState = useFeedsStore.getState();
    await saveBlob(
      buildBlob(
        feedsState.spaces,
        feedsState.feeds,
        feedsState.items,
        feedsState.folders,
        feedsState.tags,
        next
      )
    );
  },
}));
