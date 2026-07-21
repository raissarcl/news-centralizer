export function createId(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return prefix ? `${prefix}-${Date.now()}-${rand}` : `${Date.now()}-${rand}`;
}

export function itemIdFromEntry(
  feedId: string,
  guid: string,
  link: string,
): string {
  const base = guid.trim() || link.trim() || `${feedId}-${Date.now()}`;
  return `${feedId}:${base}`.slice(0, 256);
}
