export type OpmlOutline = {
  title: string;
  xmlUrl?: string;
  htmlUrl?: string;
  children?: OpmlOutline[];
};

export type OpmlFeedInput = {
  title: string;
  url: string;
  siteUrl?: string;
  folderName?: string;
};

function decodeXml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function readAttr(tag: string, name: string): string | undefined {
  const re = new RegExp(`${name}="([^"]*)"`, 'i');
  const match = tag.match(re);
  return match ? decodeXml(match[1]) : undefined;
}

function parseOutlineBlock(block: string): OpmlOutline[] {
  const outlines: OpmlOutline[] = [];
  const regex = /<outline\b([^>]*)(?:\/>|>([\s\S]*?)<\/outline>)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(block)) !== null) {
    const attrs = match[1];
    const inner = match[2] ?? '';
    const title =
      readAttr(attrs, 'title') ??
      readAttr(attrs, 'text') ??
      readAttr(attrs, 'xmlUrl') ??
      'Feed';
    const xmlUrl = readAttr(attrs, 'xmlUrl');
    const htmlUrl = readAttr(attrs, 'htmlUrl');
    const children = inner.trim() ? parseOutlineBlock(inner) : undefined;
    outlines.push({ title, xmlUrl, htmlUrl, children });
  }
  return outlines;
}

export function parseOpml(xml: string): OpmlOutline[] {
  const bodyMatch = xml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) return [];
  return parseOutlineBlock(bodyMatch[1]);
}

export function flattenOpmlFeeds(
  outlines: OpmlOutline[],
  folderName?: string
): OpmlFeedInput[] {
  const feeds: OpmlFeedInput[] = [];
  for (const outline of outlines) {
    if (outline.xmlUrl) {
      feeds.push({
        title: outline.title,
        url: outline.xmlUrl,
        siteUrl: outline.htmlUrl,
        folderName,
      });
      continue;
    }
    if (outline.children?.length) {
      feeds.push(
        ...flattenOpmlFeeds(outline.children, outline.title || folderName)
      );
    }
  }
  return feeds;
}

export function serializeOpml(
  title: string,
  folders: Array<{ name: string; feeds: OpmlFeedInput[] }>
): string {
  const folderXml = folders
    .map((folder) => {
      const feedXml = folder.feeds
        .map(
          (feed) =>
            `      <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}" htmlUrl="${escapeXml(feed.siteUrl ?? feed.url)}" />`
        )
        .join('\n');
      return `    <outline text="${escapeXml(folder.name)}" title="${escapeXml(folder.name)}">\n${feedXml}\n    </outline>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${escapeXml(title)}</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${folderXml}
  </body>
</opml>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
