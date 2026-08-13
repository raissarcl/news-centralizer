import type { FeedCatalog } from './types';
import computingCatalog from './computing.json';
import generalCatalog from './general.json';

export type { FeedCatalog, FeedCatalogEntry, FeedCatalogFolder } from './types';

/** Public (or Metro-resolved local) computing-space seed catalog. */
export const COMPUTING_FEED_CATALOG: FeedCatalog =
  computingCatalog as FeedCatalog;

/** Public (or Metro-resolved local) general-space seed catalog. */
export const GENERAL_FEED_CATALOG: FeedCatalog = generalCatalog as FeedCatalog;
