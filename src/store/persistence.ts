import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  type PersistedBlob,
  type Settings,
  type FeedSource,
  type FeedItem,
  type Folder,
  type Tag,
} from '../types';
import { migrateBlob } from './migrate';

export const STORAGE_KEY = 'news-centralizer:v1';

export async function loadBlob(): Promise<PersistedBlob> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return migrateBlob(null);
    }
    const parsed = JSON.parse(raw) as Partial<PersistedBlob>;
    const storedVersion =
      typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 0;
    const migrated = migrateBlob(parsed);
    if (migrated.schemaVersion > storedVersion) {
      await saveBlob(migrated);
    }
    return migrated;
  } catch {
    return migrateBlob(null);
  }
}

export async function saveBlob(blob: PersistedBlob): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
}

export function buildBlob(
  feeds: FeedSource[],
  items: FeedItem[],
  folders: Folder[],
  tags: Tag[],
  settings: Settings
): PersistedBlob {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    feeds,
    items,
    folders,
    tags,
    settings,
  };
}
