import AsyncStorage from '@react-native-async-storage/async-storage';
import { applySubscriptionIntent } from '../lib/feeds/subscriptionIntent';
import { getDefaultSpaces } from '../lib/spaces';
import {
  CURRENT_SCHEMA_VERSION,
  type FeedItem,
  type FeedSource,
  type Folder,
  type PersistedBlob,
  type Settings,
  type SlimStarredItem,
  type Space,
  type Tag,
} from '../types';
import { migrateBlob } from './migrate';
import {
  applySubsMetaToSettings,
  parseSubsMeta,
  settingsToSubsMeta,
  SUBS_META_KEY,
} from './subsMeta';

export const STORAGE_KEY = 'news-centralizer:v1';

export type KeyValueStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const defaultStore: KeyValueStore = AsyncStorage;

export class PersistError extends Error {
  readonly code: 'quota' | 'write' | 'parse';

  constructor(code: PersistError['code'], message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'PersistError';
    this.code = code;
  }
}

export function isQuotaError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return (
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22
    );
  }
  if (err && typeof err === 'object') {
    const name = (err as { name?: string }).name;
    const message = String((err as { message?: string }).message ?? '');
    return (
      name === 'QuotaExceededError' ||
      /quota/i.test(message) ||
      /storage.*full/i.test(message)
    );
  }
  return false;
}

/**
 * Empty structural blob used when storage is corrupt or missing.
 * Does not clear AsyncStorage — a later explicit save overwrites.
 */
function emptyPersistedBlob(): PersistedBlob {
  return migrateBlob(null);
}

function overlayMetaAndIntent(
  blob: PersistedBlob,
  metaRaw: string | null,
  overlayTombstones: boolean,
): PersistedBlob {
  const settings = applySubsMetaToSettings(
    blob.settings,
    parseSubsMeta(metaRaw),
    overlayTombstones,
  );
  const feeds = applySubscriptionIntent(blob.feeds, settings);
  const feedIds = new Set(feeds.map((f) => f.id));
  return {
    ...blob,
    settings,
    feeds,
    items: blob.items.filter((i) => feedIds.has(i.feedId)),
  };
}

/**
 * Persist a compact blob. On quota/write failure, keep the previous value.
 */
export async function saveBlob(
  blob: PersistedBlob,
  store: KeyValueStore = defaultStore,
): Promise<void> {
  const json = JSON.stringify(blob);
  try {
    await store.setItem(STORAGE_KEY, json);
  } catch (err) {
    if (isQuotaError(err)) {
      throw new PersistError(
        'quota',
        'Armazenamento cheio: não foi possível salvar. Remova itens ou limpe dados do site.',
        err,
      );
    }
    throw new PersistError(
      'write',
      'Falha ao salvar no armazenamento local.',
      err,
    );
  }
  try {
    await store.setItem(
      SUBS_META_KEY,
      JSON.stringify(settingsToSubsMeta(blob.settings)),
    );
  } catch (err) {
    console.warn(
      '[persistence] failed to write subs meta; blob was saved',
      err,
    );
  }
}

/**
 * Save after migrate. Never throws and never wipes the last good blob.
 */
async function persistMigratedBestEffort(
  blob: PersistedBlob,
  store: KeyValueStore,
): Promise<void> {
  try {
    await saveBlob(blob, store);
  } catch (err) {
    console.warn(
      '[persistence] failed to persist migrated blob; keeping last stored value',
      err,
    );
  }
}

export async function loadBlob(
  store: KeyValueStore = defaultStore,
): Promise<PersistedBlob> {
  let metaRaw: string | null = null;
  try {
    metaRaw = await store.getItem(SUBS_META_KEY);
  } catch (err) {
    console.warn('[persistence] Failed to load subs meta', err);
  }

  try {
    const raw = await store.getItem(STORAGE_KEY);
    if (!raw) {
      return overlayMetaAndIntent(emptyPersistedBlob(), metaRaw, true);
    }
    let parsed: Partial<PersistedBlob>;
    try {
      parsed = JSON.parse(raw) as Partial<PersistedBlob>;
    } catch (err) {
      console.warn(
        '[persistence] Corrupt JSON in AsyncStorage; hydrating empty without wipe',
        err,
      );
      return overlayMetaAndIntent(emptyPersistedBlob(), metaRaw, true);
    }
    const storedVersion =
      typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 0;
    const migrated = overlayMetaAndIntent(migrateBlob(parsed), metaRaw, false);
    const needsRewrite =
      migrated.schemaVersion > storedVersion ||
      (Array.isArray(parsed.items) && parsed.items.length > 0) ||
      !Array.isArray(parsed.readKeys) ||
      !Array.isArray(parsed.starredItems);

    if (needsRewrite) {
      await persistMigratedBestEffort(migrated, store);
    }
    return migrated;
  } catch (err) {
    console.warn(
      '[persistence] Failed to load blob; hydrating empty without wipe',
      err,
    );
    return overlayMetaAndIntent(emptyPersistedBlob(), metaRaw, true);
  }
}

export function buildBlob(
  spaces: Space[],
  feeds: FeedSource[],
  _items: FeedItem[],
  folders: Folder[],
  tags: Tag[],
  settings: Settings,
  readKeys: string[] = [],
  starredItems: SlimStarredItem[] = [],
): PersistedBlob {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    spaces: spaces.length > 0 ? spaces : getDefaultSpaces(),
    feeds,
    items: [],
    readKeys,
    starredItems,
    folders,
    tags,
    settings,
  };
}
