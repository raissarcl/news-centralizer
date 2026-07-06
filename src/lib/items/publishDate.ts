import { parseISO } from 'date-fns';

/** Allow small clock/timezone skew between feed servers and device. */
const FUTURE_GRACE_MS = 60 * 60 * 1000;

export function isPublishedAtDisplayable(iso: string): boolean {
  try {
    const d = parseISO(iso);
    if (Number.isNaN(d.getTime())) return false;
    return d.getTime() <= Date.now() + FUTURE_GRACE_MS;
  } catch {
    return false;
  }
}
