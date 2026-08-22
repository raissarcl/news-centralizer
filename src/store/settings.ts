import { create } from 'zustand';
import { DEFAULT_SETTINGS, type Settings } from '../types';
import { hydrateApp, runPersistedMutation } from './persistApp';

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
    await hydrateApp();
  },
  update: async (patch) => {
    await runPersistedMutation(() => {
      set({ settings: { ...get().settings, ...patch } });
    });
  },
}));
