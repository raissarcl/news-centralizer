const pages = [
  'https://blog.beerandcode.com.br/',
  'https://akitaonrails.com/',
  'https://themakitachronicles.com/',
];

for (const url of pages) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await r.text();
  const links = [
    ...html.matchAll(/href="([^"]*(?:feed|rss|atom|xml)[^"]*)"/gi),
  ].map((m) => m[1]);
  console.log(url, [...new Set(links)].slice(0, 10));
}
