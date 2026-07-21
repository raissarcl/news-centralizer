declare module 'react-native-rss-parser' {
  export type RssItem = {
    id?: string;
    title?: string;
    description?: string;
    published?: string;
    links?: { url?: string }[];
  };

  export type RssFeed = {
    title?: string;
    items?: RssItem[];
  };

  export function parse(xml: string): Promise<RssFeed>;
}
