import { decodeFeedBody } from '../rss/decodeFeedBody';
import { validateFeedUrl, type FeedUrlOptions } from './urls';

export const FETCH_LIMITS = {
  timeoutMs: 20_000,
  maxBytes: 3 * 1024 * 1024,
  maxRedirects: 3,
} as const;

export type SafeFetchResult = {
  ok: true;
  status: number;
  text: string;
  etag?: string;
  lastModified?: string;
  finalUrl: string;
};

export type SafeFetchError = {
  ok: false;
  status?: number;
  error: string;
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function resolveRedirect(current: URL, location: string): URL {
  return new URL(location, current.href);
}

export async function safeFetch(
  rawUrl: string,
  init: RequestInit & { validateOptions?: FeedUrlOptions } = {}
): Promise<SafeFetchResult | SafeFetchError> {
  const { validateOptions, ...fetchInit } = init;
  const validated = validateFeedUrl(rawUrl, validateOptions);
  if (!validated.ok) {
    return { ok: false, error: `URL inválida: ${validated.error}` };
  }

  let currentUrl = validated.url;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_LIMITS.timeoutMs);

  try {
    for (let hop = 0; hop <= FETCH_LIMITS.maxRedirects; hop++) {
      const response = await fetch(currentUrl.href, {
        ...fetchInit,
        redirect: 'manual',
        signal: controller.signal,
      });

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          return { ok: false, status: response.status, error: 'Redirect sem Location' };
        }
        if (hop >= FETCH_LIMITS.maxRedirects) {
          return { ok: false, status: response.status, error: 'Muitos redirects' };
        }
        const next = resolveRedirect(currentUrl, location);
        const nextValidated = validateFeedUrl(next.href, validateOptions);
        if (!nextValidated.ok) {
          return {
            ok: false,
            status: response.status,
            error: `Redirect bloqueado: ${nextValidated.error}`,
          };
        }
        currentUrl = nextValidated.url;
        continue;
      }

      if (response.status === 304) {
        return {
          ok: true,
          status: 304,
          text: '',
          etag: response.headers.get('etag') ?? undefined,
          lastModified: response.headers.get('last-modified') ?? undefined,
          finalUrl: currentUrl.href,
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: `HTTP ${response.status}`,
        };
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const len = parseInt(contentLength, 10);
        if (!Number.isNaN(len) && len > FETCH_LIMITS.maxBytes) {
          return {
            ok: false,
            status: response.status,
            error: `Resposta excede ${FETCH_LIMITS.maxBytes} bytes`,
          };
        }
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > FETCH_LIMITS.maxBytes) {
        return {
          ok: false,
          status: response.status,
          error: `Resposta excede ${FETCH_LIMITS.maxBytes} bytes`,
        };
      }
      const text = decodeFeedBody(
        new Uint8Array(buffer),
        response.headers.get('content-type')
      );
      return {
        ok: true,
        status: response.status,
        text,
        etag: response.headers.get('etag') ?? undefined,
        lastModified: response.headers.get('last-modified') ?? undefined,
        finalUrl: currentUrl.href,
      };
    }

    return { ok: false, error: 'Muitos redirects' };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? 'Timeout ao buscar feed'
          : err.message
        : 'Erro desconhecido';
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}
