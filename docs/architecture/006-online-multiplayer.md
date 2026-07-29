# ADR 006 — Optionele online multiplayer bovenop local-first

## Status

Geaccepteerd.

## Context

De bestaande applicatie is local-first en moet zonder account of netwerk volledig bruikbaar blijven. Online multiplayer wordt als aanvullende modus toegevoegd. Commander vraagt om meer dan twee spelers en bevat verborgen informatie zoals handen en libraryvolgorde. De browser van een tegenstander mag die informatie nooit ontvangen.

## Besluit

### Modussen en gedeelde kern

- `GameMode` is `offline | online`.
- Offline blijft lokaal authoritative, gebruikt IndexedDB/offlinepakketten en heeft geen Firebase- of Cloudflare-afhankelijkheid.
- Online is server-authoritative. De bestaande pure kaart- en spelmodellen worden hergebruikt, maar offline en online hebben aparte commanddispatchers en repositories.
- Spelers worden als `Record<PlayerId, PlayerState>` plus `turnOrder` gemodelleerd. De architectuur ondersteunt 2–6 spelers; Commander gebruikt standaard 4.

### Infrastructuur

- Firebase Authentication verzorgt identiteit en optioneel anonieme login.
- Een Cloudflare Worker in TypeScript valideert Firebase ID-tokens, beheert HTTP-routes en stuurt WebSocketverbindingen door.
- D1 bewaart lobby’s, deelnemers, zichtbaarheid, gamecodes, profielen en eventueel match history.
- Eén SQLite-backed Durable Object beheert één actieve game, alle WebSockets en de officiële game state.
- Firebase Realtime Database wordt niet gebruikt voor de actieve wedstrijd, zodat er één realtime bron van waarheid blijft.

### Lobby

Een lobby kan `public`, `private` of `invite-only` zijn. De eerste versie mag de openbare lijst periodiek via HTTP verversen. Een centrale realtime lobby-WebSocket is pas nodig wanneer polling aantoonbaar onvoldoende is.

### Authenticatie en WebSockets

1. De client logt in via Firebase en verkrijgt een ID-token.
2. De client doet een HTTPS-joinrequest met `Authorization: Bearer <token>`.
3. De Worker valideert handtekening en claims en gebruikt de geverifieerde `uid`.
4. De Worker bepaalt server-side de game, stoel en rol.
5. De Worker geeft een kortlevend, eenmalig socket-ticket uit.
6. De browser opent de WebSocket met dat ticket; het Durable Object koppelt de verbinding aan de eerder vastgestelde sessie.

De client mag nooit zelf een betrouwbare `uid`, `playerId`, stoel of rol kiezen.

### Protocol en persoonlijke views

De client stuurt commands en nooit een complete vervangende state. Commands hebben een unieke ID, `expectedVersion`, type en strikt gevalideerde payload. De server controleert lidmaatschap, rol, versie, kaartinstance, zone en structurele invarianten, maar automatiseert geen Magic-kaartregels.

Het Durable Object bewaart de volledige state en serialiseert per verbinding een afzonderlijke view:

- iedere speler ontvangt publieke zones en statussen;
- een speler ontvangt alleen zijn eigen hand en expliciet aan hem getoonde kaarten;
- van verborgen zones van anderen worden alleen toegestane aantallen gestuurd;
- spectators ontvangen standaard alleen publieke informatie;
- verborgen kaarten bevatten geen naam, Scryfall-ID, afbeelding-URL of andere afleidbare metadata.

Online Redux is uitsluitend de ontvangen clientview plus lokale UI-state. Een lokaal gemanipuleerde Redux-store verandert de server niet.

### Reconnect en versiebeheer

Het Durable Object verhoogt na iedere geaccepteerde actie de gameversie. Bij een versieconflict ontvangt de client een afwijzing en een verse persoonlijke snapshot. Na reconnect wordt eerst een volledige persoonlijke snapshot geladen en pas daarna worden nieuwe events verwerkt.

### Hoofdmenu

De startnavigatie bevat:

- Offline spelen;
- Online spelen;
- Decks beheren;
- Spel hervatten, opgesplitst in offline en online;
- Instellingen.

Online bevat minimaal inloggen, openbare lobby’s, game aanmaken en deelnemen met code. Online configuratiefouten mogen offline routes niet blokkeren.

## Gevolgen

De online laag kost meer servercode dan een volledig clientgestuurde database, maar voorkomt dat geheime state bij tegenstanders terechtkomt en houdt één officiële wedstrijdvolgorde. De bestaande offline autosave, undo/redo en offlinepakketten blijven onafhankelijk functioneren. Encryptie-at-rest is geen apart productdoel; authenticatie, autorisatie, dataminimalisatie en server-clientintegriteit krijgen prioriteit.
