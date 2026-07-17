# News Centralizer

Personal Android APK to centralize blogs, news, newsletters, and papers via RSS/Atom. Local-first: refreshes when you open the app or pull to refresh.

[English](#english) · [Português](#português)

---

## English

### Features

#### Tabs

- **Timeline**: unified chronological feed, search, filters (all / unread / starred), filter panel (period, folder, tag, sources)
- **Folders**: news by folder; feed management on a separate screen
- **Sources**: RSS feed list, filter by folder, health banner (errors/paused), enable/disable, manual add

#### Reading

- Tap opens the original link in the browser and marks the item as read
- Swipe right = mark read
- Long-press: mark read/unread, star, share, open link
- Thumbnails when the RSS feed includes an image
- Star items via the star button; mark all read per folder

#### Filters

- Filter panel: period, folder, tag, and **sources** (multi-select — tap chips to toggle; “All” clears the selection)
- No “with image” filter

#### Management

- Tags per source (CRUD in Settings)
- Global retention with Save button + per-folder retention
- OPML import/export; JSON backup (export/import)
- Eng blogs (~20 feeds) included in the default seed
- Optional local notification with headlines when few new items
- Android widget: unread count; tap opens Timeline filtered to unread (`newscentralizer://timeline?filter=unread`)
- Light / dark / system theme
- Locale pt-BR (Inbox folder = **Caixa de entrada**)

### Stack

- Expo SDK 56 + React Native + TypeScript
- expo-router
- Zustand + AsyncStorage
- fast-xml-parser (RSS + Atom)
- date-fns
- react-native-gesture-handler (Timeline swipe)

### Requirements

- Node.js (recommended: 22+)
- npm
- Java JDK 17 (for local APK)
- Android Studio + SDK + Platform-Tools (`adb`)

### First run (development)

```bash
npm install
npm run start
```

Then press `a` for the Android emulator, or scan the QR code with Expo Go.

### Security and tests

Security measures are documented in [SECURITY.md](SECURITY.md).

```bash
npm run test:security
npm run test:unit
npx tsc --noEmit
```

Before changing the default catalog:

```bash
npm run validate-feeds
```

`validate-engblogs` is an alias for the same script pointing at `src/data/engblogs-starter.opml`.

The public general-news seed is lean (`src/data/default-general-feeds.opml`, ~5 outlets). Keep a fuller private catalog in the gitignored `*.local.opml` / `*.local.ts` pair; Metro prefers those when present. Sync embeds with `npm run sync-general-feeds` or `npm run sync-general-feeds:local`.

### Build local APK (no cloud)

**Easiest:** double-click or run from the project root:

```bash
.\build-apk.bat
```

**General-news only** (hides Computing space; seeds only Geral):

```powershell
$env:EXPO_PUBLIC_GENERAL_ONLY='1'; .\build-apk.bat
```

Same flag for dev: `$env:EXPO_PUBLIC_GENERAL_ONLY='1'; npx expo start`

The script tries to create **`C:\nc`** (junction → project folder) to shorten CMake paths. If that fails, it uses the normal path.

> **Important:** `subst N:` breaks Expo and Gradle in this project. Use `.\build-apk.bat` or, once as Admin: `mklink /J C:\nc <path-to-project>`

APK output:

`android\app\build\outputs\apk\release\app-release.apk`

Install on device (USB + debugging):

```bash
adb install -r android\app\build\outputs\apk\release\app-release.apk
```

#### Manual (equivalent)

```bash
npx expo prebuild --platform android
cd android
.\gradlew.bat assembleRelease
```

#### Manual device checklist

1. Open app — UI appears before background refresh
2. TabNews and Hacker News load items
3. A BR blog (e.g. TabNews or Filipe Deschamps)
4. An Atom feed (e.g. Go blog or Stripe)
5. Pull-to-refresh on Timeline
6. Swipe right to mark read; tap opens external link and marks read
7. Long-press → share / mark unread
8. Sources tab: health banner if a feed fails
9. Folders tab: news first; “Manage feeds” separate
10. Filter panel: select multiple sources; no “with image” toggle
11. (Optional) Notification in Settings after refresh
12. (Optional) Home widget → opens unread

### Default feeds

~50+ curated feeds in `src/data/default-feeds.opml` (HN, TabNews, BR blogs, frontend, backend, DevOps, AI, eng blogs, arXiv). **Papers** folder feeds start disabled with **7-day** retention.

### RSSHub (sites without native RSS)

For sources without a public feed, use [RSSHub](https://rsshub.app):

```
https://rsshub.app/{route}
```

On **Sources → Add**, the **Suggest RSSHub URL** button tries to convert the pasted URL. Native Substack: `{domain}/feed`.

### Structure

```
app/           # expo-router routes (thin)
src/features/  # screens and components by domain
src/store/     # Zustand + persistence + v3 migration
src/lib/       # RSS, OPML, backup, notifications, feed health
src/data/      # default OPML
plugins/       # Android widget (prebuild)
scripts/       # validate-feeds, test-unit, test-security
.github/       # CI (tsc, tests, validate-feeds)
```

---

## Português

App mobile para centralizar blogs, notícias, newsletters e papers via RSS/Atom. Local-first: atualiza quando você abre o app ou puxa para refresh.

### Funcionalidades

#### Abas

- **Timeline**: feed cronológico unificado, busca, filtros (todos / não lidos / favoritos), painel de filtros (período, pasta, tag, fontes)
- **Pastas**: notícias por pasta; gerenciamento de feeds em tela separada
- **Fontes**: lista de feeds RSS, filtro por pasta, banner de saúde (erros/pausados), ativar/desativar, adicionar manualmente

#### Leitura

- Toque abre o link original no navegador e marca o item como lido
- Swipe direita = marcar lido
- Long-press: marcar lido/não lido, favoritar, compartilhar, abrir link
- Thumbnails quando o feed RSS inclui imagem
- Favoritar itens pelo botão de estrela; marcar todos lidos por pasta

#### Filtros

- Painel de filtros: período, pasta, tag e **fontes** (seleção múltipla — toque nos chips para alternar; “Todos” limpa a seleção)
- Sem filtro “Com imagem”

#### Gestão

- Tags por fonte (CRUD em Configurações)
- Retenção global com botão Salvar + retenção por pasta
- Import/export OPML; backup JSON (export/import)
- Eng blogs (~20 feeds) já inclusos no seed padrão
- Notificação local opcional com headlines quando poucos itens novos
- Widget Android: contagem de não lidos; toque abre Timeline filtrada em não lidos (`newscentralizer://timeline?filter=unread`)
- Tema claro / escuro / sistema
- Locale pt-BR (pasta Inbox = **Caixa de entrada**)

### Stack

- Expo SDK 56 + React Native + TypeScript
- expo-router
- Zustand + AsyncStorage
- fast-xml-parser (RSS + Atom)
- date-fns
- react-native-gesture-handler (swipe na Timeline)

### Requisitos

- Node.js (recomendado: 22+)
- npm
- Java JDK 17 (para APK local)
- Android Studio + SDK + Platform-Tools (`adb`)

### Primeira execução (desenvolvimento)

```bash
npm install
npm run start
```

Depois pressione `a` para abrir no emulador Android, ou escaneie o QR com Expo Go.

### Segurança e testes

Medidas de segurança documentadas em [SECURITY.md](SECURITY.md).

```bash
npm run test:security
npm run test:unit
npx tsc --noEmit
```

Antes de alterar o catálogo padrão:

```bash
npm run validate-feeds
```

`validate-engblogs` é alias do mesmo script apontando para `src/data/engblogs-starter.opml`.

O seed público de notícias gerais é enxuto (`src/data/default-general-feeds.opml`, ~5 portais). O catálogo completo fica nos arquivos gitignored `*.local.opml` / `*.local.ts`; o Metro usa esses quando existem. Para regenerar o embed: `npm run sync-general-feeds` ou `npm run sync-general-feeds:local`.

### Gerar APK local (sem cloud)

**Forma mais fácil:** dê duplo clique ou rode na raiz do projeto:

```bash
.\build-apk.bat
```

**Só notícias gerais** (sem espaço Computação; seed só do Geral):

```powershell
$env:EXPO_PUBLIC_GENERAL_ONLY='1'; .\build-apk.bat
```

Mesmo flag no dev: `$env:EXPO_PUBLIC_GENERAL_ONLY='1'; npx expo start`

O script tenta criar **`C:\nc`** (junction → pasta do projeto) para encurtar caminhos no CMake. Se falhar, usa o caminho normal.

> **Importante:** `subst N:` quebra Expo e Gradle neste projeto. Use `.\build-apk.bat` ou, uma vez como Admin: `mklink /J C:\nc <caminho-do-projeto>`

APK gerado em:

`android\app\build\outputs\apk\release\app-release.apk`

Instalar no celular (USB + depuração):

```bash
adb install -r android\app\build\outputs\apk\release\app-release.apk
```

#### Manual (equivalente)

```bash
npx expo prebuild --platform android
cd android
.\gradlew.bat assembleRelease
```

#### Checklist manual no celular

1. Abrir app — UI aparece antes do refresh em background
2. TabNews e Hacker News carregam itens
3. Um blog BR (ex.: TabNews ou Filipe Deschamps)
4. Um feed Atom (ex.: Go blog ou Stripe)
5. Pull-to-refresh na Timeline
6. Swipe direita para marcar lido; toque abre link externo e marca como lido
7. Long-press → compartilhar / marcar não lido
8. Tab Fontes: banner de saúde se algum feed falhar
9. Tab Pastas: notícias primeiro; “Gerenciar feeds” separado
10. Painel de filtros: selecionar várias fontes; sem toggle “Com imagem”
11. (Opcional) Notificação em Configurações após refresh
12. (Opcional) Widget na home → abre não lidos

### Feeds padrão

~50+ feeds curados em `src/data/default-feeds.opml` (HN, TabNews, blogs BR, frontend, backend, DevOps, AI, eng blogs, arXiv). Feeds da pasta **Papers** começam desabilitados com retenção de **7 dias**.

### RSSHub (sites sem RSS nativo)

Para fontes sem feed público, use [RSSHub](https://rsshub.app):

```
https://rsshub.app/{rota}
```

Na tela **Fontes → Adicionar**, o botão **Sugerir URL RSSHub** tenta converter a URL colada. Substack nativo: `{dominio}/feed`.

### Estrutura

```
app/           # rotas expo-router (finas)
src/features/  # telas e componentes por domínio
src/store/     # Zustand + persistência + migração v3
src/lib/       # RSS, OPML, backup, notificações, saúde feeds
src/data/      # OPML padrão
plugins/       # widget Android (prebuild)
scripts/       # validate-feeds, test-unit, test-security
.github/       # CI (tsc, testes, validate-feeds)
```
