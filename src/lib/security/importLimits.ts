import { validateFeedUrl, type FeedUrlOptions } from './urls';
import type { OpmlFeedInput } from '../opml';

export const IMPORT_LIMITS = {
  maxFileBytes: 5 * 1024 * 1024,
  maxFeedsMerge: 200,
  maxFeedsReplace: 500,
} as const;

export function assertImportFileSize(byteLength: number): void {
  if (byteLength > IMPORT_LIMITS.maxFileBytes) {
    throw new Error('IMPORT_FILE_TOO_LARGE');
  }
}

export function capFeedInputs(
  inputs: OpmlFeedInput[],
  mode: 'merge' | 'replace'
): OpmlFeedInput[] {
  const max =
    mode === 'replace'
      ? IMPORT_LIMITS.maxFeedsReplace
      : IMPORT_LIMITS.maxFeedsMerge;
  return inputs.slice(0, max);
}

export function filterValidFeedInputs(
  inputs: OpmlFeedInput[],
  options: FeedUrlOptions = {}
): { valid: OpmlFeedInput[]; skipped: number } {
  const valid: OpmlFeedInput[] = [];
  let skipped = 0;
  for (const input of inputs) {
    const result = validateFeedUrl(input.url, options);
    if (result.ok) {
      valid.push(input);
    } else {
      skipped += 1;
    }
  }
  return { valid, skipped };
}
