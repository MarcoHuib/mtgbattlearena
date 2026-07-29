<a id="readme-top"></a>

[![Issues][issues-shield]][issues-url]
[![Stars][stars-shield]][stars-url]
[![Last Commit][last-commit-shield]][commits-url]
[![TypeScript][typescript-shield]][typescript-url]

<div align="center">
  <h1 align="center">MTG Battle Mode</h1>
  <p align="center">
    Een local-first digitale tafel voor Magic: The Gathering.
    <br />
    Speel volledig offline of gebruik de optionele online multiplayerlaag voor 2–6 spelers.
    <br />
    <br />
    <a href="docs/architecture/"><strong>Bekijk de architectuur »</strong></a>
    <br />
    <br />
    <a href="#quick-start">Quick Start</a>
    &middot;
    <a href="#status">Status</a>
    &middot;
    <a href="#roadmap">Roadmap</a>
  </p>
</div>

> [!NOTE]
> Dit is een onofficieel fanproject en een handmatige digitale tafel, geen
> automatische Magic-regelsimulator.

<details>
  <summary>Inhoudsopgave</summary>
  <ol>
    <li><a href="#over-het-project">Over het project</a></li>
    <li><a href="#status">Status</a></li>
    <li><a href="#quick-start">Quick Start</a></li>
    <li><a href="#architectuur">Architectuur</a></li>
    <li><a href="#ontwikkeling">Ontwikkeling</a></li>
    <li><a href="#documentatie">Documentatie</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
  </ol>
</details>

## Over het project

MTG Battle Mode importeert openbare Archidekt-decks en verandert de browser in
een digitale Commander-tafel. De applicatie beheert kaarten, zones, leven,
poison, counters, commanderstatus en beurten, terwijl spelers alle acties zelf
uitvoeren.

De belangrijkste uitgangspunten:

- **Local-first:** offline spelen vereist geen account of backend.
- **Veilige autosave:** games, undo/redo en deck snapshots blijven lokaal
  beschikbaar.
- **Expliciete offlinepakketten:** kaartdata en afbeeldingen kunnen bewust voor
  offline gebruik worden gedownload.
- **Optioneel online:** Firebase verzorgt identiteit; Cloudflare Durable Objects
  beheren de authoritative multiplayerstate.
- **Geen rules engine:** de app automatiseert geen mana, combat, triggers of
  kaartregels.

<p align="right">(<a href="#readme-top">terug naar boven</a>)</p>

## Status

| Onderdeel                         | Status                       |
| --------------------------------- | ---------------------------- |
| Offline battle voor twee spelers  | ✅ Speelbaar                 |
| Archidekt-import                  | ✅ Openbare decks            |
| Autosave, hervatten en undo/redo  | ✅ Beschikbaar               |
| Offlinepakket en PWA              | ✅ Beschikbaar               |
| Commander-zones en statustracking | ✅ Beschikbaar               |
| Online UI en vier-spelersmock     | ✅ Speelbaar                 |
| Authoritative online game-core    | ✅ Geïmplementeerd en getest |
| Firebase SDK-bootstrap            | 🚧 Nog te configureren       |
| Cloudflare-productiedeployment    | 🚧 Nog niet uitgevoerd       |

Online ondersteunt momenteel authoritative commands voor trekken, kaarten
verplaatsen, leven en poison aanpassen, millen, schudden en de beurt doorgeven.
Tegenstanders ontvangen nooit verborgen hand- of librarymetadata.

<p align="right">(<a href="#readme-top">terug naar boven</a>)</p>

## Quick Start

Vereisten: een actuele Node.js-versie en npm.

```sh
git clone https://github.com/MarcoHuib/mtgbattlearena.git
cd mtgbattlearena
npm install
npm run dev
```

Open daarna de URL die Vite in de terminal toont. Zonder online configuratie
werkt de volledige offline flow en gebruikt het online scherm realistische
mocks.

<details>
  <summary>Belangrijkste bediening</summary>

- Sleep kaarten tussen hand, battlefield en andere zones.
- Dubbelklik een battlefieldkaart om deze te tappen of untappen.
- Gebruik rechtermuisklik of `Shift+F10` voor het toegankelijke kaartmenu.
- Gebruik Ctrl/⌘-klik of tik om meerdere kaarten te selecteren.
- Open het librarymenu voor draw X, mill X, zoeken en schudden.
- Open lege battlefieldruimte voor tafelacties en bekende tokens.

</details>

<p align="right">(<a href="#readme-top">terug naar boven</a>)</p>

## Architectuur

De repository is een npm-workspace met afzonderlijke deploybare applicaties en
gedeelde TypeScript-packages:

```text
apps/
  web/              React, Redux, IndexedDB, PWA en Playwright
  game-worker/      Firebase-validatie en SQLite Durable Objects
  import-worker/    Afgeschermde Archidekt-proxy

packages/
  game-core/        Pure game-state en state-overgangen
  game-protocol/    Zod-commands, snapshots, events en errors

docs/
  architecture/     Architecture Decision Records
```

De webapp en game-worker delen dezelfde pure game-core en hetzelfde
runtime-gevalideerde protocol. Offline Redux blijft lokaal authoritative;
online Redux bevat uitsluitend de persoonlijke serverview.

Meer achtergrond:

- [Local-first grenzen](docs/architecture/001-local-first-boundaries.md)
- [Game actions](docs/architecture/002-phase-two-game-actions.md)
- [Zones, attachments en groepen](docs/architecture/003-zone-management-attachments-groups.md)
- [Contextacties en tokens](docs/architecture/004-context-actions-and-deck-tokens.md)
- [Speler- en matchstatus](docs/architecture/005-player-and-match-status.md)
- [Online multiplayer](docs/architecture/006-online-multiplayer.md)

<p align="right">(<a href="#readme-top">terug naar boven</a>)</p>

## Ontwikkeling

### Scripts

| Command                     | Doel                                     |
| --------------------------- | ---------------------------------------- |
| `npm run dev`               | Start de webapp met Vite                 |
| `npm run build`             | Typecheck en bouw de productie-PWA       |
| `npm run preview`           | Bekijk de productiebuild lokaal          |
| `npm run format`            | Formatteer met Prettier                  |
| `npm run lint`              | Controleer met ESLint                    |
| `npm run type-check`        | Typecheck alle workspaces                |
| `npm run worker:type-check` | Typecheck de online Worker               |
| `npm test`                  | Draai package-, web- en Workertests      |
| `npm run test:integration`  | Draai de online integratiesuite          |
| `npm run test:e2e`          | Draai de kritieke Playwright-offlineflow |

<details>
  <summary>Online Worker lokaal starten</summary>

De Worker gebruikt Firebase uitsluitend voor identiteit. Kopieer eerst de
frontendomgeving:

```sh
cp apps/web/.env.example apps/web/.env.local
```

Start de online Worker met jouw Firebase-project-ID:

```sh
npx wrangler dev --config apps/game-worker/wrangler.toml \
  --var FIREBASE_PROJECT_ID:jouw-firebase-project-id \
  --var ALLOWED_ORIGIN:http://localhost:5173
```

Zet daarna `VITE_ONLINE_API_URL` in `apps/web/.env.local`. Een Firebase-private
key of serviceaccount hoort niet in deze repository.

</details>

<details>
  <summary>Archidekt Import Worker starten</summary>

```sh
npx wrangler dev --config apps/import-worker/wrangler.toml
```

De Worker accepteert uitsluitend de afgeschermde Archidekt-routes voor decks,
tokens en kaartafbeeldingen; het is geen generieke fetchproxy.

</details>

<p align="right">(<a href="#readme-top">terug naar boven</a>)</p>

## Documentatie

- [Alle architectuurbesluiten](docs/architecture/)
- [Offline implementatieprompt](FIRST_IMPLEMENTATION_PROMPT.md)
- [Online implementatieprompt](ONLINE_MULTIPLAYER_PROMPT.md)
- [Coding-agentregels](AGENTS.md)
- [Visuele tafelreferentie](docs/reference/mtg-duelist-layout.png)

<p align="right">(<a href="#readme-top">terug naar boven</a>)</p>

## Roadmap

- [x] Openbare Archidekt-decks importeren en normaliseren
- [x] Local-first battle met autosave en hervatten
- [x] Undo/redo, Commander-zones, counters, tokens en statustracking
- [x] Expliciete offlinepakketten en PWA-app-shell
- [x] Hoofdmenu, online lobby-UI en persoonlijke online Redux-view
- [x] SQLite-backed Lobby en Game Durable Objects
- [x] Authoritative online basiscommands en privacytests
- [ ] Firebase Web SDK en accountproviders configureren
- [ ] Per deelnemer een immutable online decksnapshot registreren
- [ ] Expliciete host-startflow met echte backend configureren
- [ ] Cloudflare staging- en productiedeployment
- [ ] Overige online acties zoals tokens, counters en commander damage

<p align="right">(<a href="#readme-top">terug naar boven</a>)</p>

## Disclaimer

Magic: The Gathering en alle bijbehorende namen en afbeeldingen zijn eigendom
van Wizards of the Coast. Dit project is niet verbonden aan of goedgekeurd door
Wizards of the Coast.

<!-- MARKDOWN LINKS & IMAGES -->

[issues-shield]: https://img.shields.io/github/issues/MarcoHuib/mtgbattlearena?style=for-the-badge
[issues-url]: https://github.com/MarcoHuib/mtgbattlearena/issues
[stars-shield]: https://img.shields.io/github/stars/MarcoHuib/mtgbattlearena?style=for-the-badge
[stars-url]: https://github.com/MarcoHuib/mtgbattlearena/stargazers
[last-commit-shield]: https://img.shields.io/github/last-commit/MarcoHuib/mtgbattlearena?style=for-the-badge
[commits-url]: https://github.com/MarcoHuib/mtgbattlearena/commits
[typescript-shield]: https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[typescript-url]: https://www.typescriptlang.org/
