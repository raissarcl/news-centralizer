export const RSSHUB_BASE = 'https://rsshub.app';

export function isRssHubUrl(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return host === 'rsshub.app' || host.endsWith('.rsshub.app');
  } catch {
    return false;
  }
}

/** Converte URL de site ou Substack em rota RSSHub genérica (heurística). */
export function suggestRssHubUrl(siteUrl: string): string | null {
  try {
    const u = new URL(siteUrl.trim());
    const host = u.hostname.toLowerCase();

    if (host.endsWith('.substack.com')) {
      const user = host.replace('.substack.com', '');
      return `${RSSHUB_BASE}/substack/subscribe/${user}`;
    }

    if (host.includes('youtube.com') || host === 'youtu.be') {
      return null;
    }

    return `${RSSHUB_BASE}/blog/${host.replace(/^www\./, '')}`;
  } catch {
    return null;
  }
}

export const RSSHUB_EXAMPLES = [
  { label: 'Substack', example: 'https://codigoemdia.substack.com/feed' },
  {
    label: 'RSSHub (site sem RSS)',
    example: 'https://rsshub.app/substack/subscribe/codigoemdia',
  },
] as const;
