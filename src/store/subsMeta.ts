import type { Settings } from '../types';
import {
  normalizeUrlList,
  unionUrlLists,
} from '../lib/feeds/subscriptionIntent';

export const SUBS_META_KEY = 'news-centralizer:subs-meta';

export type SubsMeta = {
  seeded: boolean;
  seededGeneral: boolean;
  removedFeedUrls: string[];
  disabledFeedUrls: string[];
};

export function settingsToSubsMeta(settings: Settings): SubsMeta {
  return {
    seeded: settings.seeded === true,
    seededGeneral: settings.seededGeneral === true,
    removedFeedUrls: settings.removedFeedUrls ?? [],
    disabledFeedUrls: settings.disabledFeedUrls ?? [],
  };
}

export function parseSubsMeta(raw: string | null): SubsMeta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SubsMeta>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      seeded: parsed.seeded === true,
      seededGeneral: parsed.seededGeneral === true,
      removedFeedUrls: normalizeUrlList(parsed.removedFeedUrls),
      disabledFeedUrls: normalizeUrlList(parsed.disabledFeedUrls),
    };
  } catch {
    return null;
  }
}

/** Overlay sidecar flags/tombstones onto settings so a missing blob cannot re-seed. */
export function applySubsMetaToSettings(
  settings: Settings,
  meta: SubsMeta | null,
  overlayTombstones = true,
): Settings {
  if (!meta) return settings;
  return {
    ...settings,
    seeded: settings.seeded || meta.seeded,
    seededGeneral: settings.seededGeneral || meta.seededGeneral,
    removedFeedUrls: overlayTombstones
      ? unionUrlLists(settings.removedFeedUrls, meta.removedFeedUrls)
      : settings.removedFeedUrls,
    disabledFeedUrls: overlayTombstones
      ? unionUrlLists(settings.disabledFeedUrls, meta.disabledFeedUrls)
      : settings.disabledFeedUrls,
  };
}
