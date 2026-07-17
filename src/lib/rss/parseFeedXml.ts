import { XMLParser } from 'fast-xml-parser';
import { isPublishedAtDisplayable } from '@/lib/items/publishDate';
import { cleanFeedText } from '@/lib/text/cleanFeedText';
import { validateItemLink, unwrapEmbeddedHttpUrl } from '@/lib/security/urls';

export const PARSE_LIMITS = {
  maxEntries: 500,
  maxTitle: 500,
  maxSummary: 2000,
  maxLink: 2048,
} as const;

export type RawFeedEntry = {
  guid: string;
  title: string;
  link: string;
  summary?: string;
  imageUrl?: string;
  publishedAt: string;
};

const XML_PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  processEntities: false,
} as const;

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function clamp(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function textValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj['#text'] === 'string') return obj['#text'].trim();
    if (typeof obj.__cdata === 'string') return obj.__cdata.trim();
  }
  return '';
}

function parsePublishedAt(raw: unknown): string | null {
  const s = textValue(raw);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const iso = d.toISOString();
  return isPublishedAtDisplayable(iso) ? iso : null;
}

function atomLink(entry: Record<string, unknown>): string {
  const links = asArray(entry.link);
  for (const link of links) {
    if (typeof link === 'object' && link !== null) {
      const l = link as Record<string, unknown>;
      const rel = textValue(l['@_rel']) || 'alternate';
      const href = textValue(l['@_href']);
      if (href && (rel === 'alternate' || !l['@_rel'])) return href;
    }
  }
  const first = links[0];
  if (typeof first === 'object' && first !== null) {
    return textValue((first as Record<string, unknown>)['@_href']);
  }
  return textValue(first);
}

function normalizeEntry(entry: {
  guid: string;
  title: string;
  link: string;
  summary?: string;
  imageUrl?: string;
  publishedAt: string;
}): RawFeedEntry {
  const imageUrl = entry.imageUrl ? sanitizeImageUrl(entry.imageUrl) : undefined;
  const title = cleanFeedText(entry.title || 'Sem título', PARSE_LIMITS.maxTitle);
  const summary = entry.summary
    ? cleanFeedText(entry.summary, PARSE_LIMITS.maxSummary)
    : undefined;
  return {
    guid: clamp(entry.guid, PARSE_LIMITS.maxLink),
    title: title || 'Sem título',
    link: clamp(
      sanitizeItemLink(entry.link || entry.guid),
      PARSE_LIMITS.maxLink
    ),
    summary: summary || undefined,
    imageUrl,
    publishedAt: entry.publishedAt,
  };
}

function sanitizeImageUrl(raw: string): string | undefined {
  const validated = validateItemLink(raw.trim());
  return validated.ok ? validated.url.href : undefined;
}

function sanitizeItemLink(raw: string): string {
  return unwrapEmbeddedHttpUrl(raw.trim());
}

function extractImageUrl(entry: Record<string, unknown>, htmlRaw?: string): string | undefined {
  const media = entry['media:thumbnail'] ?? entry.mediaThumbnail ?? entry.thumbnail;
  const mediaItems = asArray(media);
  for (const item of mediaItems) {
    if (typeof item === 'object' && item !== null) {
      const url = textValue((item as Record<string, unknown>)['@_url']);
      const sanitized = url ? sanitizeImageUrl(url) : undefined;
      if (sanitized) return sanitized;
    }
  }

  const enclosures = asArray(entry.enclosure);
  for (const enc of enclosures) {
    if (typeof enc === 'object' && enc !== null) {
      const type = textValue((enc as Record<string, unknown>)['@_type']);
      const url = textValue((enc as Record<string, unknown>)['@_url']);
      if (url && type.toLowerCase().startsWith('image/')) {
        const sanitized = sanitizeImageUrl(url);
        if (sanitized) return sanitized;
      }
    }
  }

  const html = htmlRaw ?? '';
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (match?.[1]) return sanitizeImageUrl(match[1]);

  return undefined;
}

function parseAtomEntries(xml: string): RawFeedEntry[] {
  const parser = new XMLParser(XML_PARSER_OPTIONS);
  const doc = parser.parse(xml) as Record<string, unknown>;
  const feed = (doc.feed ?? doc['atom:feed']) as Record<string, unknown> | undefined;
  if (!feed) return [];

  return asArray(feed.entry)
    .map((entry) => {
      const e = entry as Record<string, unknown>;
      const link = atomLink(e);
      const guid = textValue(e.id) || link;
      const title = textValue(e.title) || 'Sem título';
      const summaryRaw =
        textValue(e.summary) || textValue(e.content) || textValue(e.subtitle);
      const publishedAt = parsePublishedAt(e.updated ?? e.published);
      if (!publishedAt) return null;
      const imageUrl = extractImageUrl(e, summaryRaw);
      return normalizeEntry({
        guid,
        title,
        link: link || guid,
        summary: summaryRaw || undefined,
        imageUrl,
        publishedAt,
      });
    })
    .filter((entry): entry is RawFeedEntry => entry !== null);
}

function parseRssItems(xml: string): RawFeedEntry[] {
  const parser = new XMLParser(XML_PARSER_OPTIONS);
  const doc = parser.parse(xml) as Record<string, unknown>;
  const rss = doc.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  if (!channel) return [];

  return asArray(channel.item)
    .map((item) => {
      const i = item as Record<string, unknown>;
      const link = textValue(i.link) || textValue(i['atom:link']);
      const guid = textValue(i.guid) || textValue(i.id) || link;
      const title = textValue(i.title) || 'Sem título';
      const summaryRaw =
        textValue(i.description) ||
        textValue(i['content:encoded']) ||
        textValue(i.summary);
      const publishedAt = parsePublishedAt(
        i.pubDate ?? i.published ?? i.updated ?? i['dc:date'] ?? i.date
      );
      if (!publishedAt) return null;
      const imageUrl = extractImageUrl(i, summaryRaw);
      return normalizeEntry({
        guid: guid || link,
        title,
        link: link || guid,
        summary: summaryRaw || undefined,
        imageUrl,
        publishedAt,
      });
    })
    .filter((entry): entry is RawFeedEntry => entry !== null);
}

/**
 * RSS 1.0 / RDF (e.g. Deutsche Welle): items are siblings of channel under RDF,
 * not nested inside channel like RSS 2.0.
 */
function parseRdfItems(xml: string): RawFeedEntry[] {
  const parser = new XMLParser(XML_PARSER_OPTIONS);
  const doc = parser.parse(xml) as Record<string, unknown>;
  const rdf = (doc.RDF ?? doc['rdf:RDF']) as Record<string, unknown> | undefined;
  if (!rdf) return [];

  return asArray(rdf.item)
    .map((item) => {
      const i = item as Record<string, unknown>;
      const about =
        textValue(i['@_about']) ||
        textValue(i['@_rdf:about']) ||
        textValue(i['@rdf:about']);
      const link = textValue(i.link) || about;
      const guid = textValue(i.guid) || textValue(i.id) || about || link;
      const title = textValue(i.title) || 'Sem título';
      const summaryRaw =
        textValue(i.description) ||
        textValue(i['content:encoded']) ||
        textValue(i.content) ||
        textValue(i.summary);
      const publishedAt = parsePublishedAt(
        i['dc:date'] ??
          i.date ??
          i.pubDate ??
          i.published ??
          i.updated
      );
      if (!publishedAt) return null;
      const imageUrl = extractImageUrl(i, summaryRaw);
      return normalizeEntry({
        guid: guid || link,
        title,
        link: link || guid,
        summary: summaryRaw || undefined,
        imageUrl,
        publishedAt,
      });
    })
    .filter((entry): entry is RawFeedEntry => entry !== null);
}

export function parseFeedXml(xml: string): RawFeedEntry[] {
  const trimmed = xml.trim();
  if (!trimmed) return [];

  try {
    let entries: RawFeedEntry[] = [];
    const looksAtom = /<feed[\s>]/i.test(trimmed) || /<entry[\s>]/i.test(trimmed);
    const looksRdf =
      /<(?:rdf:)?RDF[\s>]/i.test(trimmed) ||
      /xmlns:rdf=/i.test(trimmed) ||
      /rss\/1\.0/i.test(trimmed);

    if (looksAtom && !looksRdf) {
      entries = parseAtomEntries(trimmed);
    }
    if (entries.length === 0 && looksRdf) {
      entries = parseRdfItems(trimmed);
    }
    if (entries.length === 0) {
      entries = parseRssItems(trimmed);
    }
    if (entries.length === 0 && !looksAtom) {
      entries = parseAtomEntries(trimmed);
    }
    if (entries.length === 0) {
      entries = parseRdfItems(trimmed);
    }

    return entries.slice(0, PARSE_LIMITS.maxEntries);
  } catch {
    return [];
  }
}
