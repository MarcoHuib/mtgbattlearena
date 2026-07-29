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

- Firebase Authentication is de enige identity provider en verzorgt login,
  accountproviders en ID-tokens. De Worker valideert die tokens en bepaalt zelf
  alle host-, speler- en spectatorrechten.
- Cloudflare Access en Cloudflare RBAC worden niet voor spelers gebruikt.
- Een Cloudflare Worker in TypeScript beheert de publieke HTTPS-API,
  Firebase-tokenvalidatie en WebSocket-upgrades.
- Eén SQLite-backed `LobbyDurableObject` bewaart lobby’s, deelnemers,
  zichtbaarheid, statussen en gamecodes.
- Iedere wedstrijd heeft precies één SQLite-backed `GameDurableObject` met de
  authoritative game-state en alle bijbehorende WebSockets.
- D1 en Firebase Realtime Database worden niet gebruikt.

### Lobby

Een lobby kan `public`, `private` of `invite-only` zijn. De openbare lijst,
aanmaken, deelnemen en ticketuitgifte lopen via normale HTTPS-requests met
JSON. Het centrale Lobby Durable Object verwerkt deze operaties via Durable
Object RPC en gebruikt zijn eigen SQLite-opslag. Er is geen lobby-WebSocket.

### Game, transport en opslag

De Worker gebruikt Durable Object namespacebindings en RPC voor
initialisatie, snapshots en commands. Een interne `fetch` naar een Game Durable
Object is uitsluitend nodig voor de WebSocket-upgrade. Er zijn geen onnodige
HTTP-calls tussen Worker en Durable Objects en er wordt geen gRPC of gRPC-Web
gebruikt.

Het Game Durable Object houdt de actuele state in geheugen. Na initialisatie
en ieder geaccepteerd command schrijft het één versioned snapshot naar zijn
eigen SQLite-opslag. Read-only requests en afgewezen commands schrijven niet.
Na hibernation, restart, deployment of crash laadt een nieuwe instantie eerst
dit snapshot via `blockConcurrencyWhile`.

### Authenticatie en WebSockets

1. De client logt in via Firebase en verkrijgt een ID-token.
2. De client doet een HTTPS-joinrequest met `Authorization: Bearer <token>`.
3. De Worker valideert handtekening en claims en gebruikt de geverifieerde `uid`.
4. De Worker bepaalt server-side de game, stoel en rol.
5. De Worker geeft een kortlevend, eenmalig socket-ticket uit.
6. Het Lobby Durable Object verbruikt het ticket atomair en exact eenmaal.
7. De browser opent de WebSocket; het Game Durable Object koppelt de verbinding
   aan de eerder vastgestelde sessie.

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

## Implementatiestatus — speelbare authoritative slice

De eerste infrastructuurslice volgt dit besluit als volgt:

- de bestaande Vite-app gebruikt URL-routes met `/offline`,
  `/offline/battle`, `/online`, `/decks`, `/resume` en `/settings`;
- offline Redux, Dexie-autosave, undo/redo, import en offlinepakketten zijn niet
  afhankelijk gemaakt van auth of online services;
- `AuthService`, `OnlineGameService` en twee `GameCommandDispatcher`-adapters
  vormen de applicatiegrens; componenten importeren geen Firebase- of
  Cloudflare-SDK;
- `packages/game-protocol/src` bevat strikte Zod-schema’s. Een persoonlijke snapshot
  bevat publieke spelers plus maximaal één eigen `privateView`; een spectator
  kan nooit zo’n private view valideren;
- `apps/game-worker/src` bevat Firebase RS256/JWK-validatie, een SQLite-backed Lobby
  Durable Object, server-toegewezen deelname, 30-seconden-tickets die atomair
  eenmaal worden gebruikt, RPC/HTTP/WebSocket-routing en een SQLite-backed
  Durable Object-klasse per game;
- het Game Durable Object gebruikt de pure game-core via een serveradapter,
  ondersteunt 2–6 generieke spelers en koppelt iedere stoel blijvend aan de
  door de Worker geverifieerde Firebase-UID;
- de actuele game-state blijft in geheugen; alleen initialisatie en
  geaccepteerde statewijzigingen schrijven een herstelbaar SQLite-snapshot;
- `DRAW_CARD`, `MOVE_CARD`, `CHANGE_LIFE`, `CHANGE_POISON`, `MILL`,
  `SHUFFLE_LIBRARY` en `PASS_TURN` zijn authoritative en verhogen ieder de
  stateversie. Bekende maar nog niet gebouwde commands geven `NOT_READY`;
- één serializer maakt per WebSocket een afzonderlijke snapshot. Publieke
  zones worden volledig getoond, de eigen hand staat alleen in `privateView`
  en handen/libraries van anderen bestaan uitsluitend als aantallen;
- de online React-route bewaart alleen deze gevalideerde persoonlijke view in
  de online Redux-slice. De WebSocket-adapter vraagt voor iedere reconnect een
  nieuw eenmalig ticket en vervangt de clientview met de eerste verse snapshot;
- de UI gebruikt standaard mocks. Een ingestelde echte API zonder gekoppelde
  Firebase-port faalt zichtbaar en veilig, terwijl alle offline routes blijven
  werken.

De host-initialisatieroute accepteert gevalideerde decks voor exact de
server-toegewezen spelers. Door de browser ingestuurde UID’s worden niet
geaccepteerd: de Worker voegt UID en displaynaam pas na de
Lobby-Durable-Object-deelnemerscontrole toe aan de interne seed. De volgende
integratieslice laat iedere deelnemer een
eigen immutable decksnapshot registreren en voegt een expliciete host-startactie
toe; tot die tijd gebruikt de web-UI zonder productieconfiguratie de speelbare
vier-spelersfixture.
