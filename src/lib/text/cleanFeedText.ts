/** Decode common HTML entities (repeat for double-encoded content). */
function decodeHtmlEntities(text: string): string {
  let out = text;
  for (let i = 0; i < 3; i++) {
    const next = out
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#0?39;/gi, "'")
      .replace(/&apos;/gi, "'")
      .replace(/&nbsp;/gi, ' ')
      .replace(/&#(\d+);/g, (_, code) => {
        const n = Number(code);
        return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
      })
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
        const n = parseInt(hex, 16);
        return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
      });
    if (next === out) break;
    out = next;
  }
  return out;
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Plain text for titles and summaries (handles encoded HTML and tags). */
export function cleanFeedText(raw: string, maxLength?: number): string {
  let text = raw.trim();
  for (let i = 0; i < 3; i++) {
    text = decodeHtmlEntities(text);
    const stripped = stripHtmlTags(text);
    if (stripped === text) break;
    text = stripped;
  }
  text = text.replace(/\s+/g, ' ').trim();
  if (maxLength != null && text.length > maxLength) {
    return text.slice(0, maxLength);
  }
  return text;
}
