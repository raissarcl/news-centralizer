# Security

Threat model and controls for **News Centralizer** (personal Android APK, local-first RSS reader).

## Threat model

| In scope | Out of scope |
|----------|----------------|
| Malicious OPML / backup JSON the user imports | Compromised device / root |
| Feed XML that tries to drive bad URLs or oversized payloads | Multi-user / hosted backend (there is none) |
| Accidental cleartext HTTP | Attacker on the same LAN forcing the phone to SSRF a shared proxy (N/A — no proxy) |

The app fetches feeds **on-device**. There is no Node/CORS proxy. Abuse is limited to what this device is willing to request or open.

## Controls

### URLs (`src/lib/security/urls.ts`)

- Feeds: HTTPS by default; `http:` only if `allowHttpFeeds` is true in storage (UI no longer enables it — Android blocks cleartext).
- Blocked schemes: `file:`, `javascript:`, `data:`, `intent:`, `content:`, `vbscript:`.
- No credentials in URLs; length cap 2048.
- Private / link-local / CGNAT / metadata hostnames; decimal/hex/octal IP tricks; IPv4-mapped IPv6.

### Fetch (`safeFetch` + `fetchFeed`)

- Manual redirects (max 3), each hop re-validated.
- Timeout 8s, body max 3MB.
- XML parse limits (`PARSE_LIMITS`); `processEntities: false`.

### Opening articles (`safeOpenLink`)

- `validateItemLink` then `WebBrowser` / `Linking` with safe schemes only.

### Import

- OPML: file size + feed count caps (`IMPORT_LIMITS`).
- Backup JSON: 5MB file, max 50k items / 2k feeds; feed URLs re-validated; `favicon` / `imageUrl` / `siteUrl` must pass `validateItemLink` or are dropped.

### Android

- Network security config: **cleartext disabled** globally (`plugins/withNetworkSecurity.js`).
- `allowBackup: false` in `app.json`.
- Widget receiver not exported; deep link only toggles timeline filter.

### Display

- Titles/summaries cleaned (`cleanFeedText`) and shown in React Native `Text` (no HTML engine).

### RSSHub

- Optional third-party routes (`rsshub.app`). The instance sees the requested path and your IP. Acknowledged in-app before first use.

## Tests

```bash
npm run test:security
```

## Related

Web counterpart (`news-centralizer-web`) adds a local HTTPS-only fetch proxy with loopback bind, DNS checks, and rate limits — those apply only to the web app.
