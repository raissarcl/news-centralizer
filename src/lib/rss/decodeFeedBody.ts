/** Decode feed response bytes using Content-Type charset or XML declaration. */

type DecodableCharset = 'utf-8' | 'iso-8859-1' | 'windows-1252';

/** windows-1252 codepoints for 0x80–0x9F (rest matches Latin-1). */
const WINDOWS_1252_C1: Record<number, number> = {
  0x80: 0x20ac, // €
  0x82: 0x201a, // ‚
  0x83: 0x0192, // ƒ
  0x84: 0x201e, // „
  0x85: 0x2026, // …
  0x86: 0x2020, // †
  0x87: 0x2021, // ‡
  0x88: 0x02c6, // ˆ
  0x89: 0x2030, // ‰
  0x8a: 0x0160, // Š
  0x8b: 0x2039, // ‹
  0x8c: 0x0152, // Œ
  0x8e: 0x017d, // Ž
  0x91: 0x2018, // ‘
  0x92: 0x2019, // ’
  0x93: 0x201c, // “
  0x94: 0x201d, // ”
  0x95: 0x2022, // •
  0x96: 0x2013, // –
  0x97: 0x2014, // —
  0x98: 0x02dc, // ˜
  0x99: 0x2122, // ™
  0x9a: 0x0161, // š
  0x9b: 0x203a, // ›
  0x9c: 0x0153, // œ
  0x9e: 0x017e, // ž
  0x9f: 0x0178, // Ÿ
};

/** Hermes/RN TextDecoder often only supports UTF-8 — decode Latin-1 manually. */
function decodeSingleByte(
  bytes: Uint8Array,
  mapC1?: Record<number, number>,
): string {
  const chars: string[] = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    const code = mapC1 && b >= 0x80 && b <= 0x9f ? (mapC1[b] ?? b) : b;
    chars[i] = String.fromCharCode(code);
  }
  return chars.join('');
}

function normalizeCharset(raw: string): DecodableCharset | null {
  const c = raw.trim().toLowerCase().replace(/_/g, '-');
  if (c === 'utf8' || c === 'utf-8') return 'utf-8';
  if (
    c === 'latin1' ||
    c === 'latin-1' ||
    c === 'iso-8859-1' ||
    c === 'iso8859-1'
  ) {
    return 'iso-8859-1';
  }
  if (c === 'windows-1252' || c === 'cp1252' || c === 'cp-1252') {
    return 'windows-1252';
  }
  // Unknown labels: treat as UTF-8 later; do not pass to TextDecoder.
  return null;
}

function charsetFromContentType(
  contentType: string | null,
): DecodableCharset | null {
  if (!contentType) return null;
  const match = /charset\s*=\s*["']?([^"';\s]+)/i.exec(contentType);
  return match ? normalizeCharset(match[1]) : null;
}

function charsetFromXmlDeclaration(bytes: Uint8Array): DecodableCharset | null {
  // ASCII/Latin-1 peek — never use TextDecoder here (Hermes lacks latin1).
  const head = decodeSingleByte(bytes.subarray(0, 256));
  const match = /<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i.exec(head);
  return match ? normalizeCharset(match[1]) : null;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    // Extremely defensive: Hermes should support utf-8.
    return decodeSingleByte(bytes);
  }
}

function decodeBytes(bytes: Uint8Array, charset: DecodableCharset): string {
  switch (charset) {
    case 'iso-8859-1':
      return decodeSingleByte(bytes);
    case 'windows-1252':
      return decodeSingleByte(bytes, WINDOWS_1252_C1);
    case 'utf-8':
    default:
      return decodeUtf8(bytes);
  }
}

/**
 * Folha and other legacy RSS feeds declare ISO-8859-1 while Content-Type is
 * often just `text/xml`. Decoding as UTF-8 corrupts accented text.
 * Prefer header charset, then XML declaration.
 *
 * Important: React Native / Hermes TextDecoder typically only supports UTF-8,
 * so Latin-1 / windows-1252 are decoded manually (no TextDecoder labels).
 */
export function decodeFeedBody(
  bytes: Uint8Array,
  contentType: string | null,
): string {
  const charset =
    charsetFromContentType(contentType) ??
    charsetFromXmlDeclaration(bytes) ??
    'utf-8';

  return decodeBytes(bytes, charset);
}
