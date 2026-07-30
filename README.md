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
> Dit is een onafhankelijk, onofficieel fanproject en een handmatige digitale
> tafel. Het is geen automatische Magic-regelsimulator en geen officiële
> Archidekt-, Scryfall- of Wizards-applicatie.

<details>
  <summary>Inhoudsopgave</summary>
  <ol>
    <li><a href="#over-het-project">Over het project</a></li>
    <li><a href="#status">Status</a></li>
    <li><a href="#quick-start">Quick Start</a></li>
    <li><a href="#architectuur">Architectuur</a></li>
    <li><a href="#ontwikkeling">Ontwikkeling</a></li>
    <li><a href="#externe-diensten-en-databronnen">Externe diensten en databronnen</a></li>
    <li><a href="#documentatie">Documentatie</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#juridische-documenten">Juridische documenten</a></li>
    <li><a href="#disclaimer">Disclaimer</a></li>
  </ol>
</details>

## Over het project

MTG Battle Mode importeert openbare decklijsten vanuit Archidekt en verandert de
browser in een digitale Commander-tafel. De applicatie beheert kaarten, zones,
leven, poison, counters, commanderstatus en beurten, terwijl spelers alle
spelacties zelf uitvoeren.

De Archidekt-integratie gebruikt publiek bereikbare deckgegevens om decklijsten,
categorieën, gekozen printings en bijbehorende kaartinformatie te importeren.
Deze integratie is onofficieel en vormt geen samenwerking, goedkeuring of
ondersteuning door Archidekt.

De belangrijkste uitgangspunten:

- **Local-first:** offline spelen vereist geen account of backend.
- **Veilige autosave:** games, undo/redo en deck snapshots blijven lokaal
  beschikbaar.
- **Expliciete offlinepakketten:** kaartdata en afbeeldingen kunnen bewust voor
  offline gebruik worden gedownload.
- **Optioneel online:** Firebase verzorgt identiteit; Cloudflare Durable Objects
  beheren de authoritative multiplayerstate.
- **Dezelfde digitale tafel:** een online duel gebruikt dezelfde ruimtelijke
  tegenover-elkaar-opstelling als offline. Iedere speler kiest eerst privé een
  openingshand of mulligan; spelen begint pas wanneer iedereen de hand houdt.
- **Persoonlijke decklijst:** online geïmporteerde decks worden lokaal per
  Firebase-gebruiker geïndexeerd. Identieke imports worden hergebruikt en decks
  kunnen met bevestiging uit de eigen lijst worden verwijderd.
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
De hoofdbalk toont op iedere route één centrale arenastatus, gebaseerd op de
echte Worker-healthcheck. Bij serveruitval wordt de online lobbyflow vervangen
door een retry- en offline-melding; lokale battles blijven beschikbaar.
In een wachtkamer kiest of importeert iedere speler zijn eigen lokale
decksnapshot. Alleen de decknaam en gereedstatus zijn zichtbaar; zodra alle
seats en decks gereed zijn kan de geverifieerde host de authoritative battle
starten.

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
  import-worker/    Afgeschermde proxy voor openbare Archidekt-deckdata

packages/
  game-core/        Pure game-state en state-overgangen
  game-protocol/    Zod-commands, snapshots, events en errors

docs/
  architecture/     Architecture Decision Records
  legal/            Privacy, voorwaarden en externe vermeldingen
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
- [Gedeelde offline/online speeltafel](docs/architecture/007-shared-battle-runtime.md)

<p align="right">(<a href="#readme-top">terug naar boven</a>)</p>

## Ontwikkeling

### Scripts

| Command                           | Doel                                           |
| --------------------------------- | ---------------------------------------------- |
| `npm run dev`                     | Start de webapp met Vite                       |
| `npm run dev:worker:game`         | Start de online Worker lokaal                  |
| `npm run dev:worker:import`       | Start de Archidekt Import Worker lokaal        |
| `npm run build`                   | Typecheck en bouw de productie-PWA             |
| `npm run preview`                 | Bekijk de productiebuild lokaal                |
| `npm run format`                  | Formatteer met Prettier                        |
| `npm run lint`                    | Controleer met ESLint                          |
| `npm run type-check`              | Typecheck alle workspaces                      |
| `npm run worker:type-check`       | Typecheck de online Worker                     |
| `npm test`                        | Draai package-, web- en Workertests            |
| `npm run test:integration`        | Draai de online integratiesuite                |
| `npm run test:e2e`                | Draai de kritieke Playwright-offlineflow       |
| `npm run cloudflare:login`        | Log Wrangler in bij Cloudflare                 |
| `npm run cloudflare:status`       | Toon het actieve Cloudflare-account            |
| `npm run deploy:cloudflare:check` | Bouw en controleer beide Workers zonder upload |
| `npm run deploy:cloudflare`       | Deploy beide Workers naar Cloudflare           |
| `npm run firebase:status`         | Toon de Firebase-login en het actieve project  |
| `npm run dev:firebase:hosting`    | Bouw en serveer Firebase Hosting lokaal        |
| `npm run deploy:firebase`         | Bouw en deploy de webapp naar Firebase Hosting |
| `npm run deploy:all`              | Deploy Cloudflare Workers en Firebase Hosting  |

<details>
  <summary>Online Worker lokaal starten</summary>

De Worker gebruikt Firebase uitsluitend voor identiteit. Kopieer eerst de
frontendomgeving:

```sh
cp apps/web/.env.example apps/web/.env.local
```

Start de online Worker. De niet-geheime Firebase-project-ID en lokale origin
staan in `apps/game-worker/wrangler.toml`:

```sh
npm run dev:worker:game
```

Zet daarna `VITE_ONLINE_API_URL` en `VITE_ONLINE_SOCKET_URL` in
`apps/web/.env.local`. Een Firebase-private key of serviceaccount hoort niet in
deze repository.

</details>

De productiebuild gebruikt `apps/web/.env.production` met
`https://api.mtgbattlearena.nl` voor REST en imports, en
`https://ws.mtgbattlearena.nl` voor de WebSocket-upgrade. De online Worker is
de publieke API-gateway en roept de begrensde import-Worker intern aan via een
Cloudflare service binding. Lokale ontwikkeling houdt dezelfde
`/api/import/archidekt`-routes via de Vite-proxy.

<details>
  <summary>Firebase Hosting handmatig deployen</summary>

Firebase Authentication wordt in de Firebase Console geconfigureerd en heeft
geen afzonderlijke code-deployment. De statische React-webapp wordt wel via
Firebase Hosting gedeployed.

Controleer eerst de actieve Firebase-login en projectkoppeling:

```sh
npm run firebase:status
```

Bouw en serveer de Hosting-configuratie lokaal:

```sh
npm run dev:firebase:hosting
```

Deploy daarna uitsluitend de webapp:

```sh
npm run deploy:firebase
```

Deploy Cloudflare en Firebase samen alleen wanneer beide wijzigingen
productieklaar zijn:

```sh
npm run deploy:all
```

Firebase Hosting gebruikt project `mtgbattlearena` en publiceert standaard op
`https://mtgbattlearena.web.app`. De Firebase CLI moet lokaal geïnstalleerd en
ingelogd zijn; hij blijft buiten de npm-dependencies om de applicatieaudit
schoon te houden.

Een nieuw frontenddomein moet zowel bij **Firebase Authentication → Authorized
domains** als in `ALLOWED_ORIGIN` in `apps/game-worker/wrangler.toml` worden
toegevoegd. Zonder de Worker-origin levert de browser bij online API-calls een
CORS-fout op die doorgaans als `Failed to fetch` zichtbaar wordt.

</details>

<details>
  <summary>Archidekt Import Worker starten</summary>

```sh
npm run dev:worker:import
```

De Worker accepteert uitsluitend afgeschermde routes voor openbare
Archidekt-deckgegevens en de bijbehorende externe kaartafbeeldingen. Het is geen
generieke fetchproxy.

</details>

<details>
  <summary>Cloudflare Workers handmatig deployen</summary>

Controleer eerst het actieve Cloudflare-account en voer een dry-run uit:

```sh
npm run cloudflare:status
npm run deploy:cloudflare:check
```

Deploy daarna beide Workers:

```sh
npm run deploy:cloudflare
```

Je kunt ze ook afzonderlijk deployen:

```sh
npm run deploy:cloudflare:game
npm run deploy:cloudflare:import
```

Deze commando's deployen geen frontend. Een centraal web-deployscript wordt
toegevoegd zodra Firebase Hosting of een andere frontendhost is geconfigureerd.

</details>

<p align="right">(<a href="#readme-top">terug naar boven</a>)</p>

## Externe diensten en databronnen

MTG Battle Mode gebruikt of kan gebruikmaken van diensten van externe partijen:

- **Archidekt:** openbare decklijsten worden via een onofficiële,
  read-only-integratie geïmporteerd. Archidekt kan endpoints, gegevensformaten
  of toegang zonder aankondiging wijzigen.
- **Scryfall:** kaartmetadata en kaartafbeeldingen kunnen via Scryfall-URL's of
  Scryfall-diensten worden geladen. Afbeeldingen moeten ongewijzigd en met
  zichtbare artiesten- en copyrightinformatie worden weergegeven.
- **Firebase:** verzorgt authenticatie en gebruikersidentiteit voor de optionele
  online multiplayerlaag.
- **Cloudflare:** verzorgt Workers, Durable Objects en infrastructuur voor de
  optionele online multiplayer- en importlaag.

Archidekt, Scryfall, Firebase, Cloudflare en Wizards of the Coast zijn geen
sponsors van dit project en hebben het project niet beoordeeld of goedgekeurd.
Zie [Third-party notices](docs/legal/THIRD_PARTY_NOTICES.md) voor details.

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
- [x] Persoonlijke online openingshand, mulligan en volledige tafelweergave
- [ ] Firebase Web SDK en accountproviders configureren
- [ ] Per deelnemer een immutable online decksnapshot registreren
- [ ] Expliciete host-startflow met echte backend configureren
- [ ] Cloudflare staging- en productiedeployment
- [ ] Overige online acties zoals tokens, counters en commander damage
- [ ] Privacyverzoeken, bewaartermijnen en accountverwijdering technisch
      implementeren

<p align="right">(<a href="#readme-top">terug naar boven</a>)</p>

## Disclaimer

MTG Battle Mode is onafhankelijk en onofficieel fancontent onder de Wizards of
the Coast Fan Content Policy. Wizards heeft het project niet goedgekeurd of
onderschreven. Een deel van het gebruikte materiaal is eigendom van Wizards of
the Coast LLC. © Wizards of the Coast LLC.

Magic: The Gathering, kaartnamen, symbolen, illustraties en overige bijbehorende
materialen zijn eigendom van Wizards of the Coast LLC en/of hun respectieve
rechthebbenden.

De namen Archidekt en Scryfall en de bijbehorende diensten en handelsmerken
behoren toe aan hun respectieve eigenaren. De integraties zijn onofficieel en
houden geen samenwerking, sponsoring of goedkeuring in.

<!-- MARKDOWN LINKS & IMAGES -->

[issues-shield]: https://img.shields.io/github/issues/MarcoHuib/mtgbattlearena?style=for-the-badge
[issues-url]: https://github.com/MarcoHuib/mtgbattlearena/issues
[stars-shield]: https://img.shields.io/github/stars/MarcoHuib/mtgbattlearena?style=for-the-badge
[stars-url]: https://github.com/MarcoHuib/mtgbattlearena/stargazers
[last-commit-shield]: https://img.shields.io/github/last-commit/MarcoHuib/mtgbattlearena?style=for-the-badge
[commits-url]: https://github.com/MarcoHuib/mtgbattlearena/commits
[typescript-shield]: https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[typescript-url]: https://www.typescriptlang.org/
