import type { Space } from '@/types';
import { isGeneralOnly } from '@/lib/appMode';

export const COMPUTING_SPACE_ID = 'computing';
export const GENERAL_SPACE_ID = 'general';

const ALL_DEFAULT_SPACES: Space[] = [
  {
    id: COMPUTING_SPACE_ID,
    name: 'Computação',
    icon: 'code-slash-outline',
    sortOrder: 0,
  },
  {
    id: GENERAL_SPACE_ID,
    name: 'Geral',
    icon: 'newspaper-outline',
    sortOrder: 1,
  },
];

export function getDefaultSpaces(): Space[] {
  if (isGeneralOnly()) {
    return [
      {
        id: GENERAL_SPACE_ID,
        name: 'Geral',
        icon: 'newspaper-outline',
        sortOrder: 0,
      },
    ];
  }
  return ALL_DEFAULT_SPACES.map((s) => ({ ...s }));
}

export function ensureDefaultSpaces(spaces: Space[] | undefined): Space[] {
  const defaults = getDefaultSpaces();
  if (isGeneralOnly()) {
    if (!Array.isArray(spaces) || spaces.length === 0) {
      return defaults.map((s) => ({ ...s }));
    }
    const existing = spaces.find((s) => s.id === GENERAL_SPACE_ID);
    return existing
      ? [{ ...defaults[0], ...existing, id: GENERAL_SPACE_ID, sortOrder: 0 }]
      : defaults.map((s) => ({ ...s }));
  }

  if (!Array.isArray(spaces) || spaces.length === 0) {
    return defaults.map((s) => ({ ...s }));
  }
  const byId = new Map(spaces.map((s) => [s.id, s]));
  const merged = defaults.map((def) => {
    const existing = byId.get(def.id);
    return existing ? { ...def, ...existing, id: def.id } : { ...def };
  });
  for (const space of spaces) {
    if (!merged.some((s) => s.id === space.id)) {
      merged.push(space);
    }
  }
  return merged.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function resolveActiveSpaceId(
  activeSpaceId: string | undefined,
  spaces: Space[],
): string {
  if (isGeneralOnly()) {
    return GENERAL_SPACE_ID;
  }
  if (activeSpaceId && spaces.some((s) => s.id === activeSpaceId)) {
    return activeSpaceId;
  }
  return spaces[0]?.id ?? COMPUTING_SPACE_ID;
}
