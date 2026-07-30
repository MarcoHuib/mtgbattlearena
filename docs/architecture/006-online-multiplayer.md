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
- `api.mtgbattlearena.nl` is de publieke REST-gateway. De online Worker stuurt
  `/api/import/archidekt/*` intern via een Cloudflare service binding door naar
  de afzonderlijke import-Worker.
- `ws.mtgbattlearena.nl` accepteert uitsluitend de WebSocket-upgrade. De
  API-hostnaam accepteert geen socket-upgrade en de WebSocket-hostnaam
  publiceert geen REST-routes.
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

De online middenbalk volgt dezelfde taakverdeling als offline: fase,
beurtverloop, Monarch, Initiative en Dag/Nacht zijn publieke,
server-authoritative matchstatus. Trekken, millen en schudden horen bij het
actiemenu van de eigen library en staan niet in de globale middenbalk.
De publieke spelerweergave bevat daarnaast commander tax, commander damage,
Energy, Experience, Rad, City’s Blessing en de uitgeschakelde status. Wijzigen
gaat uitsluitend via gevalideerde commands van de geverifieerde speler.
Graveyard en exile zijn publieke zones en mogen daarom in een grotere
doorzoekbare zonebrowser worden getoond. Een librarybrowser is privé en mag pas
kaarten tonen wanneer die via de persoonlijke snapshot expliciet aan die
speler zijn vrijgegeven.

Alleen de geverifieerde host kan een actieve game expliciet afbreken. De Worker
markeert de lobby als `finished`, het Game Durable Object stuurt
`GAME_ABORTED` naar alle verbonden spelers en sluit daarna de sockets. Nieuwe
socket-tickets en reconnects voor die game worden vervolgens geweigerd.

De volledige speeltafelpresentatie en alle gebruikersacties worden sinds
[ADR 007](007-shared-battle-runtime.md) door offline en online gedeeld. Alleen
de lokale Redux-adapter en de persoonlijke-snapshot/commandadapter verschillen.

De openingshand is eveneens authoritative. Iedere speler ontvangt alleen de
eigen zeven kaarten en stuurt `MULLIGAN_HAND` of `KEEP_HAND` als versioned
command. De server voert de shuffle en nieuwe draw uit, bewaart per speler het
aantal mulligans en blokkeert gewone spelcommands totdat alle spelers hun hand
hebben gehouden. Tegenstanders en spectators zien alleen of een speler gereed
is, nooit de inhoud van die hand.

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
  `SHUFFLE_LIBRARY`, `NEXT_PHASE`, `PASS_TURN`, `SET_MONARCH`,
  `SET_INITIATIVE`, `SET_DAY_NIGHT`, `UNTAP_ALL`, `CHANGE_TRACKER`,
  `SET_TRACKER_VISIBILITY`, `SET_CITYS_BLESSING`, `SET_PLAYER_DISABLED`,
  `CHANGE_COMMANDER_TAX`, `CHANGE_COMMANDER_DAMAGE`, `REVEAL_LIBRARY` en
  `HIDE_LIBRARY` zijn authoritative en verhogen ieder de stateversie;
- `CREATE_TOKEN` bevat een runtime-gevalideerde tokendefinitie en een
  genormaliseerde battlefieldpositie. De server koppelt die uitsluitend aan de
  geverifieerde speler en maakt zelf de definitie- en instance-ID’s. Bekende
  decktokens worden bij deckregistratie meegestuurd en staan alleen als
  catalogus in de persoonlijke view;
- één serializer maakt per WebSocket een afzonderlijke snapshot. Publieke
  zones worden volledig getoond, de eigen hand staat alleen in `privateView`
  en handen/libraries van anderen bestaan uitsluitend als aantallen. Een
  tijdelijke libraryweergave komt alleen in de persoonlijke `privateView` van
  de eigenaar en wordt bij het sluiten van de browser weer ingetrokken;
- de online React-route bewaart alleen deze gevalideerde persoonlijke view in
  de online Redux-slice. De WebSocket-adapter vraagt voor iedere reconnect een
  nieuw eenmalig ticket en vervangt de clientview met de eerste verse snapshot;
- offline en online renderen exact dezelfde `BattleTable`, spelerpanelen,
  zones, kaarten, contextmenu's, browsers, openingshand en dnd-kit-interactie.
  De offline adapter dispatcht lokale transitions; de online adapter verstuurt
  versioned commands en wacht op de bevestigende persoonlijke snapshot;
- multiselect, kaartposities, tappen, counters, kaartzijden, attachments,
  groepen, tokens, libraryacties en speler-/matchstatus gebruiken dezelfde
  actie-interface en dezelfde pure game-core-transities;
- één gedeelde arena-statusprovider controleert bij opstarten, terugkeer naar
  het tabblad, browser-reconnect en vervolgens periodiek de publieke
  `/api/online/health`-route. Alleen de hoofdbalk toont deze serverstatus;
  wanneer de healthcheck faalt, verbergt de online overzichtsroute login-,
  join- en aanmaakacties en biedt zij retry en offline spelen aan;
- een geauthenticeerde lobbylijst bevat alleen de rol van de huidige viewer
  (`host`, `player` of `spectator`) en nooit UID's van andere deelnemers. De
  web-UI toont join- en aanmaakacties alleen na login en opent een wachtende
  lobby niet als een al geïnitialiseerde game;
- wachtende games hebben een afzonderlijke lobbyroute. Deze haalt via HTTPS
  periodiek een geminimaliseerde deelnemerslijst op en navigeert alle
  deelnemers naar het speelveld zodra de status `active` wordt. Alleen de
  geverifieerde host kan een nog niet gestarte lobby definitief verwijderen;
- iedere speler registreert in de wachtkamer uitsluitend zijn eigen
  genormaliseerde decksnapshot. De Lobby Durable Object bewaart deze
  startpayload per geverifieerde UID, maar retourneert aan de wachtkamer alleen
  de decknaam en gereedstatus. De host kan geen decks of seats voor andere
  spelers aanleveren;
- de host-startactie wordt pas geaccepteerd wanneer exact het ingestelde aantal
  spelers aanwezig is en iedere speler een deck heeft geregistreerd. De Worker
  bouwt daarna server-side de `OnlineGameSeed`, initialiseert het Game Durable
  Object en markeert de lobby pas na een geldige persoonlijke snapshot als
  actief;
- de UI gebruikt standaard mocks. Een ingestelde echte API zonder gekoppelde
  Firebase-port faalt zichtbaar en veilig, terwijl alle offline routes blijven
  werken.

De browser kan bij deckregistratie geen betrouwbare UID, `playerId`, seat of
displaynaam aanleveren. De Worker koppelt de payload aan de geverifieerde
Firebase-UID; de Lobby Durable Object voegt pas bij de start de
server-toegewezen speler-ID en displaynaam aan de interne seed toe. De
voormalige publieke initialisatieroute waarbij de host alle spelerdecks
aanleverde is verwijderd.
