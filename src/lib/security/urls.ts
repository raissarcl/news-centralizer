export type UrlValidationError =
  | 'malformed'
  | 'invalid_scheme'
  | 'too_long'
  | 'credentials_in_url'
  | 'private_host'
  | 'empty_host';

export type UrlValidationResult =
  | { ok: true; url: URL }
  | { ok: false; error: UrlValidationError };

export type FeedUrlOptions = {
  allowHttp?: boolean;
};

export type ItemLinkOptions = {
  allowHttp?: boolean;
};

const MAX_URL_LENGTH = 2048;

const BLOCKED_SCHEMES = new Set([
  'file:',
  'javascript:',
  'data:',
  'intent:',
  'content:',
  'vbscript:',
]);

function parseIpv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => {
    if (!/^\d{1,3}$/.test(p)) return NaN;
    return parseInt(p, 10);
  });
  if (nums.some((n) => Number.isNaN(n) || n > 255)) return null;
  return nums;
}

function isPrivateIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true;
  if (h.startsWith('fc') || h.startsWith('fd')) return true;
  if (h.startsWith('fe80:')) return true;
  if (h === '::' || h === '0:0:0:0:0:0:0:0') return true;
  return false;
}

export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local')) return true;

  const ipv4 = parseIpv4(host);
  if (ipv4) return isPrivateIpv4(ipv4);

  if (host.includes(':')) return isPrivateIpv6(host);

  return false;
}

function baseValidate(
  raw: string,
  allowedSchemes: Set<string>
): UrlValidationResult {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) {
    return { ok: false, error: trimmed.length > MAX_URL_LENGTH ? 'too_long' : 'malformed' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'malformed' };
  }

  const scheme = parsed.protocol.toLowerCase();
  if (BLOCKED_SCHEMES.has(scheme) || !allowedSchemes.has(scheme)) {
    return { ok: false, error: 'invalid_scheme' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: 'credentials_in_url' };
  }

  const host = parsed.hostname;
  if (!host) {
    return { ok: false, error: 'empty_host' };
  }

  if (isPrivateHost(host)) {
    return { ok: false, error: 'private_host' };
  }

  return { ok: true, url: parsed };
}

export function validateFeedUrl(
  raw: string,
  options: FeedUrlOptions = {}
): UrlValidationResult {
  const schemes = new Set(['https:']);
  if (options.allowHttp) schemes.add('http:');
  return baseValidate(raw, schemes);
}

export function validateItemLink(
  raw: string,
  options: ItemLinkOptions = { allowHttp: true }
): UrlValidationResult {
  const schemes = new Set<string>(['https:']);
  if (options.allowHttp !== false) schemes.add('http:');
  return baseValidate(raw, schemes);
}

export function feedUrlErrorMessage(error: UrlValidationError): string {
  switch (error) {
    case 'invalid_scheme':
      return 'invalidFeedUrlScheme';
    case 'private_host':
      return 'invalidFeedUrlPrivate';
    case 'too_long':
      return 'invalidFeedUrlTooLong';
    case 'credentials_in_url':
      return 'invalidFeedUrlCredentials';
    default:
      return 'invalidFeedUrl';
  }
}
