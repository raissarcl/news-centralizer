import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDefaultSpaces } from '../lib/spaces';
import {
  CURRENT_SCHEMA_VERSION,
  type FeedItem,
  type FeedSource,
  type Folder,
  type PersistedBlob,
  type Settings,
  type Space,
  type Tag,
} from '../types';
import { migrateBlob } from './migrate';

export const STORAGE_KEY = 'news-centralizer:v1';

/**
 * Empty structural blob used when storage is corrupt.
 * Does not clear AsyncStorage — a later explicit save overwrites.
 */
function emptyPersistedBlob(): PersistedBlob {
  return migrateBlob(null);
}

export async function loadBlob(): Promise<PersistedBlob> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyPersistedBlob();
    }
    let parsed: Partial<PersistedBlob>;
    try {
      parsed = JSON.parse(raw) as Partial<PersistedBlob>;
    } catch (err) {
      console.warn(
        '[persistence] Corrupt JSON in AsyncStorage; hydrating empty without wipe',
        err,
      );
      return emptyPersistedBlob();
    }
    const storedVersion =
      typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 0;
    const migrated = migrateBlob(parsed);
    if (migrated.schemaVersion > storedVersion) {
      await saveBlob(migrated);
    }
    return migrated;
  } catch (err) {
    console.warn(
      '[persistence] Failed to load blob; hydrating empty without wipe',
      err,
    );
    return emptyPersistedBlob();
  }
}

export async function saveBlob(blob: PersistedBlob): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
}

export function buildBlob(
  spaces: Space[],
  feeds: FeedSource[],
  items: FeedItem[],
  folders: Folder[],
  tags: Tag[],
  settings: Settings,
): PersistedBlob {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    spaces: spaces.length > 0 ? spaces : getDefaultSpaces(),
    feeds,
    items,
    folders,
    tags,
    settings,
  };
}
