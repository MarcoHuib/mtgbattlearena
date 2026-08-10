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
- Google en Microsoft mogen aan dezelfde Firebase-user worden gekoppeld. Bij
  `account-exists-with-different-credential` bewaart de webadapter de pending
  Microsoft-credential uitsluitend kort in geheugen, authenticeert de gebruiker
  opnieuw met Google en roept daarna `linkWithCredential` aan op die bestaande
  user. Daardoor blijft de bestaande Firebase-UID — en alle UID-gebonden
  applicatiedata — behouden; koppeling gebeurt nooit alleen op basis van een
  gelijk e-mailadres en credentials worden niet gelogd of persistent opgeslagen.
- De weborigin stuurt in Production, Beta en lokale Vite-runs expliciet
  `Cross-Origin-Opener-Policy: same-origin-allow-popups`. Deze COOP-variant
  behoudt origin-isolatie voor normale navigaties maar staat de cross-origin
  Firebase OAuth-popuprelatie toe die nodig is voor `signInWithPopup`; er zijn
  hiervoor geen bestaande securityheaders verwijderd of afgezwakt.
- Chromium kan tijdens een verder succesvolle Firebase-popupflow desondanks
  `Cross-Origin-Opener-Policy policy would block the window.closed call`
  rapporteren. Firebase Auth pollt intern periodiek `popup.window.closed` om
  annulering te detecteren; de applicatie zelf leest of sluit browservensters
  niet. Productie gebruikt `same-origin-allow-popups`, terwijl de door Firebase
  gehoste gereserveerde `__/auth/handler`- en `__/auth/iframe`-responses geen
  aanvullende COOP-, COEP- of CSP-header opleggen. Wanneer de popup-Promise een
  Firebase-resultaat of een concrete Auth-fout retourneert en accountkoppeling
  slaagt, behandelen we deze Chromium-consolemelding daarom als niet-functionele
  browser/SDK-diagnostiek. We verlagen securityheaders niet en voegen geen
  popup-workaround toe om alleen deze melding te verbergen.
- De PWA-navigation fallback sluit het volledige door Firebase Hosting
  gereserveerde `/__/`-namespace uit. Daardoor bereiken custom-domain
  OAuth-popups altijd de echte `/__/auth/handler` en worden ze niet door een
  actieve service worker vervangen met de gecachte React-appshell.
- Firebase Analytics wordt alleen dynamisch geladen nadat de bezoeker
  analytische cookies expliciet toestaat. De keuze staat lokaal onder
  `mtg-analytics-consent-v1`, is via Instellingen intrekbaar en staat los van
  Firebase Authentication. Analyticsopslag kan worden toegestaan;
  advertentieopslag, advertentie-userdata en personalisatie blijven altijd
  geweigerd. SPA-routewisselingen sturen na toestemming een handmatige
  `page_view`; vóór toestemming wordt de Analytics SDK niet geladen.
- Cloudflare Access en Cloudflare RBAC worden niet voor spelers gebruikt.
- Een Cloudflare Worker in TypeScript beheert de publieke HTTPS-API,
  Firebase-tokenvalidatie en WebSocket-upgrades.
- `api.mtgbattlearena.nl` is de publieke REST-gateway. De online Worker stuurt
  `/api/import/archidekt/*` intern via een Cloudflare service binding door naar
  de afzonderlijke import-Worker.
- De Import Worker heeft voor zowel Production als Beta `workers_dev` en
  preview-URL's uitgeschakeld en heeft geen publieke route. Alleen de
  environment-specifieke `IMPORT` Service Binding kan hem bereiken; CORS geldt
  daarbij uitsluitend als browsercompatibiliteit/defense-in-depth, niet als
  authenticatie.
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

Omdat alle lobbydirectorydata voorlopig in één globaal Lobby Durable Object
staat, begrenst de server creatie met de geverifieerde Firebase-UID. Per UID
zijn maximaal drie `waiting`-lobby's en afzonderlijk drie lobby's in
`starting`/`active` toegestaan. Creatie heeft daarnaast een burstlimiet van
drie pogingen per minuut en een vensterlimiet van vijf pogingen per tien
minuten. Rate-windowregistratie, quotacontrole en lobby/host-insert gebeuren in
één synchrone SQLite-transactie.

Een `waiting`-lobby verloopt twee uur na `created_at`; een `finished`-lobby
wordt 24 uur na zijn laatste `updated_at` verwijderd. Het Durable Object zet
een alarm op de eerstvolgende vervaldatum. Cleanup verwijdert lobby,
participants en decks atomair via foreign-keycascades en is idempotent.
Een startreservering die door een afgebroken Workerflow langer dan tien minuten
in `starting` blijft staan, wordt door hetzelfde alarm teruggezet naar
`waiting`. De oorspronkelijke `created_at` blijft behouden, zodat een inmiddels
verlopen wachtende lobby in dezelfde cleanup alsnog wordt verwijderd.
Listings filteren verlopen wachtende lobby's ook vóór een alarmcleanup, zodat
oude of misbruikte records geen geldige openbare resultaten verdringen.
Inactieve `lobby_creation_limits`-rijen worden na 24 uur fysiek verwijderd via
de index op `window_started_at`.
Securitylogs bevatten alleen een eventnaam, UID, quotagroep/limiet of
cleanup-aantallen—nooit tokens, authorizationheaders, socket-tickets of
joincodes.

Een `active` lobby wordt momenteel alleen `finished` wanneer de host de actieve
game expliciet afbreekt. Er bestaat nog geen betrouwbare normale
match-completion- of inactivity-transition. Daardoor kunnen verlaten actieve
lobby's, inclusief hun deelnemers- en deckrecords, onbeperkt bewaard blijven.
Een vervolghardening moet serveractiviteit op het Game Durable Object bijhouden
en een ruime, productmatig gekozen inactiviteitsretentie toepassen (bijvoorbeeld
30 dagen met waarschuwing/herstelruimte), waarna lobby en gamesnapshot samen
veilig naar `finished`/cleanup kunnen. Een korte generieke timeout is bewust
niet toegepast, omdat persistente langdurige Commander-games geldig zijn.

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

Socket-tickets blijven uitsluitend als SHA-256-hash in SQLite staan. Een
geldige consumptie leest en verwijdert de rij in dezelfde synchrone
SQLite-transactie; een tweede consumptie kan de rij daardoor niet meer vinden.
Verlopen tickets en eventuele legacy-rijen met `used_at` worden opportunistisch
opgeruimd, maximaal eenmaal per 30 seconden per actief Durable Object. Dezelfde
cleanup verwijdert verlopen rate-limitwindows. Uitgifte is per geverifieerde
UID/game begrensd op twee nog geldige tickets en tien uitgiftepogingen per
minuut. De quota- en rate-limitcontrole en het opslaan van een nieuw ticket
gebeuren samen atomair.

### Game Durable Object-abusegrenzen

Het eenmalige H-03-ticket wordt door het Lobby Durable Object gevalideerd en
verwijderd voordat de interne WebSocket-upgrade het Game Durable Object
bereikt. Het Game Durable Object telt daarna de door Cloudflare beheerde
hibernation-WebSockets via hun geserialiseerde sessieattachments. Per UID/game
zijn maximaal twee actieve sockets toegestaan; daarnaast zijn maximaal twintig
spectatorsockets per game toegestaan. Een afwijzing verbruikt het ticket dus
definitief en sluit geen bestaande socket. Omdat tellingen uit
`getWebSockets()` worden afgeleid, zijn geen driftgevoelige persistente
connectietellers nodig na close, netwerkverlies, hibernation of reconstructie.

Iedere verbonden UID krijgt per Game Durable Object maximaal dertig
commandachtige applicatieberichten per tien seconden. De kleine SQLite-tabel
heeft één rij per UID, een index op het vensterbegin en opportunistische
cleanup. Na attachmentvalidatie wordt eerst de ruwe grootte bepaald: strings
als UTF-8 en binaryframes rechtstreeks via `byteLength`. De applicatiegrens is
16 KiB (16.384 bytes). Daarna telt dezelfde limiter de poging, gevolgd door de
16-KiB-afwijzing, playerrolcontrole, binarydecodering, `JSON.parse`, Zod en
domeinvalidatie. Spectator-, malformed- en oversized commandspam is daardoor
niet gratis, terwijl te grote binaryframes nooit eerst naar tekst worden
gedecodeerd. Dertig acties laten snelle menselijke interactie toe, terwijl
machine-speed snapshot-, persist- en broadcastamplificatie wordt begrensd. Een
afzonderlijk weighted model is niet gebruikt: groeicommands worden daarnaast
door onderstaande harde stategrenzen beperkt.

De centrale Game Durable Object-limieten zijn:

- 2.500 kaartinstanties per game, ruim boven zes normale Commander-decks plus
  ongeveer 1.900 tokens;
- 1.000 kaart-/tokendefinities per game;
- 500 kaartgroepen;
- 32 verschillende counternamen per kaartinstantie;
- 4 MiB voor de daadwerkelijk als UTF-8 JSON gepersisteerde volledige
  `StoredGameRecord`;
- 4 MiB UTF-8 per geserialiseerde persoonlijke of spectator-WebSocketsnapshot.

Deckhoeveelheden, definities en de UTF-8-grootte van de seed worden vóór
stateconstructie gecontroleerd.
Ieder command bouwt daarna eerst een kandidaatstate. Instance-, map-,
persisted-JSON- en alle mogelijke persoonlijke snapshotgrenzen worden vóór
SQLite-persistence en broadcasts gevalideerd. De aparte snapshotgrens is nodig
omdat een view gedeelde kaartdefinitievelden per zichtbare kaartinstantie kan
herhalen en dus groter kan zijn dan de genormaliseerde `StoredGameRecord`. Een
afwijzing behoudt daardoor de vorige in-memory state, snapshotversie en
databasepayload en verstuurt geen kandidaatstate. Een extra check direct vóór
`WebSocket.send()` beschermt ook bij een eventueel legacy snapshot boven de
nieuwe grens; zo'n frame wordt nooit gedeeltelijk door de applicatie verstuurd.

Bij broadcasts wordt een persoonlijke snapshot eenmaal per equivalente
sessieview (`role`, UID, player-ID en hoststatus) gegenereerd en als dezelfde
JSON naar de maximaal twee sockets van die gebruiker gestuurd. Verschillende
spelers houden afzonderlijke cachesleutels; spectators delen alleen wanneer hun
volledige autorisatieview equivalent is. Hiermee blijft verborgen hand- en
librarydata strikt per speler gescheiden. Delta/event-synchronisatie blijft een
latere optimalisatie; H-02 behoudt bewust het bestaande full-snapshotprotocol.

De gecombineerde theoretische fan-out is twaalf playersockets (zes spelers ×
twee) plus twintig spectators, dus 32 sockets. Een normale game heeft maximaal
zeven daadwerkelijk verschillende views: zes private spelersviews en één
publieke spectatorview. Bij de 4-MiB-viewgrens kan één broadcast toch 128 MiB
uitgaand verkeer veroorzaken. Omdat de commandlimiet per UID geldt, konden zes
spelers theoretisch 180 commands per tien seconden accepteren: zonder
gamebudget 22,5 GiB per venster.

Daarom delen commandbroadcasts en initiële snapshots een persistent Game
Durable Object-budget van 512 MiB per vast venster van tien seconden. Ieder
geaccepteerd command reserveert vóór persistence de exacte som van
`serializedViewBytes × ontvangende sockets`; niet alleen het aantal unieke
serialisaties. Dit laat vier absolute worst-case 128-MiB-broadcasts toe, terwijl
normale kleinere snapshots tientallen snelle interacties blijven ondersteunen.
Een overschrijding retourneert
`GAME_BROADCAST_RATE_LIMITED`, zonder statewijziging, SQLite-snapshotwrite of
gedeeltelijke broadcast. Het singleton-budget in SQLite blijft correct over
hibernation en reconstructie en is per Game Durable Object geïsoleerd.

De kandidaatvalidatie retourneert de reeds geserialiseerde, op grootte
gecontroleerde views. Na budgetreservering en persistence gebruikt broadcast
exact die strings; er is geen tweede snapshotserialisatieronde meer. Voor de
defensieve autorisatiegrens worden host/non-hostvarianten apart gecachet, maar
verschillende player-UID's delen nooit een private view. Alle geldige
spectators delen uitsluitend de identieke publieke spectatorview.

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
- de WebSocket wordt pas gestart nadat de route haar eventlistener heeft
  geregistreerd. Daardoor kunnen het initiële snapshot en vroege broadcasts
  niet tussen `connectGame` en `subscribe` verloren gaan;
- iedere geaccepteerde mutation loopt na persist via één
  `broadcastPersonalViews`-pad. Iedere hibernated socket heeft een attachment
  met game, geverifieerde gebruiker/seat, rol, connection-ID en laatst
  verzonden versie. Een fout op een stale socket wordt per socket afgehandeld
  en onderbreekt de overige ontvangers niet;
- de online Redux-slice accepteert volledige snapshots met een hogere versie
  en idempotente snapshots met dezelfde versie, maar negeert oudere versies en
  snapshots voor een andere game. Pending eigen commands blokkeren een extern
  veroorzaakt authoritative snapshot niet;
- reconnect registreert een nieuwe socket, ontvangt direct de nieuwste
  persoonlijke snapshot en blijft daarna op hetzelfde broadcastpad. Met de
  optionele Worker-variabele `REALTIME_DEBUG=true` logt dit pad uitsluitend
  game-ID, commandtype, oude/nieuwe versie en het aantal bereikte sockets;
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

## Omgevingsisolatie

De online architectuur draait in twee volledig gescheiden omgevingen. De
standaard-Wranglerconfiguratie blijft Production (`mtg-battle-mode-online` met
`mtg-battle-mode-import`); `[env.staging]` maakt Beta
(`mtg-battle-mode-online-staging` met `mtg-battle-mode-import-staging`). De
staging service binding wordt expliciet opnieuw gedefinieerd en kan daardoor
niet stilzwijgend naar de Production Import Worker wijzen.

Lobby- en Game-bindings staan eveneens expliciet onder `[env.staging]`. Ze
verwijzen zonder `script_name` naar de staging Game Worker en gebruiken daarmee
eigen Durable Object-namespaces en SQLite-state. De migratiereeks wordt voor de
nieuwe namespaces herhaald; de Production migrations en bestaande state worden
niet gewijzigd. Beta en Production valideren ID-tokens bewust tegen hetzelfde
Firebaseproject en delen Firebase Authentication. Alleen Hosting-sites en de
Cloudflare game-state zijn per omgeving gescheiden.

Beide omgevingen worden vanuit één release op `main` gepromoveerd. De frontend
wordt eenmaal gebouwd en leest omgevingendpoints uit een niet-gecachete
`runtime-config.js`; Beta en Production gebruiken daardoor identieke
JavaScript-/CSS-bundles. Het releasebuildnummer wordt als runtimewaarde en als
Wrangler `RELEASE_VERSION` doorgegeven. De releaseworkflow deployt altijd eerst
de volledig gescheiden Beta-resources en start Production uitsluitend nadat
alle vereiste Beta-deployments zijn geslaagd.
