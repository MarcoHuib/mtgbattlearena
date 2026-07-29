# AGENTS.md — MTG Battle Mode

Lees dit bestand volledig voordat je wijzigingen maakt. Dit bestand is leidend voor architectuur, scope, kwaliteit en werkwijze.

## 1. Projectdoel

Bouw een onofficiële Magic: The Gathering Battle Mode die zowel **volledig lokaal/offline** als **optioneel online multiplayer** kan worden gebruikt.

De applicatie is een digitale tafel en geen automatische Magic-regelsimulator. In offline modus kan één gebruiker meerdere zijden lokaal bedienen. In online modus bestuurt iedere deelnemer zijn eigen speler binnen één gedeelde game.

De kernervaring:

1. Openbare Archidekt-deck-URL’s invoeren, importeren en normaliseren.
2. Zonder account een lokale battle starten en volledig offline kunnen hervatten.
3. Kaarten handmatig tussen zones verplaatsen en spelstatussen bijhouden.
4. De game automatisch lokaal opslaan en expliciet downloaden voor offline gebruik, inclusief kaartafbeeldingen.
5. Optioneel inloggen via Firebase Authentication.
6. Een online lobby aanmaken, openbare games bekijken of deelnemen via gamecode/uitnodiging.
7. Online Commander-games met 2 tot 6 spelers spelen, met 4 als standaard.
8. Dezelfde pure game-core en kaartmodellen hergebruiken zonder offline van de backend afhankelijk te maken.

## 2. Productprincipes

### 2.1 Local-first

Een gestarte offline game mag niet verloren gaan door een verbroken internetverbinding, refresh, crash of gesloten browser.

Voor offline gebruik is internet alleen noodzakelijk voor:

* het eerste importeren van een deck;
* het ophalen van nog niet lokaal beschikbare kaartafbeeldingen;
* het bewust controleren op een nieuwere deckversie.

Na import moeten deckdata en offline spelstatus lokaal beschikbaar blijven. Online multiplayer vereist vanzelfsprekend een netwerkverbinding, maar mag de offline routes, repositories of gameflow nooit blokkeren.

### 2.2 Handmatige tafel, geen rules engine

De app begrijpt niet automatisch wat iedere Magic-kaart doet.

De gebruiker voert acties zelf uit, zoals:

* kaart trekken;
* kaart spelen;
* kaart tappen;
* counters toevoegen;
* leven aanpassen;
* kaarten verplaatsen;
* tokens aanmaken;
* commander damage bijhouden.

Bouw geen automatische mana-validatie, trigger-resolutie, combatberekening of volledige kaartregels.

### 2.3 Offline is een kernfunctie

Er zijn twee opslagniveaus:

1. **Automatische cache** voor normaal online gebruik.
2. **Expliciet offlinepakket** via “Download voor offline gebruik”.

Een offlinepakket bevat minimaal:

* genormaliseerde snapshots van beide decks;
* kaartdefinities;
* alle benodigde kaartafbeeldingen;
* beide zijden van dubbelzijdige kaarten;
* bekende tokens en emblems voor zover betrouwbaar te bepalen;
* huidige game of mogelijkheid om met die twee decks een nieuwe game te starten;
* manifest met versie, bestandsgrootte en downloadstatus.

Een expliciet offlinepakket mag niet hetzelfde worden behandeld als tijdelijke browsercache.

### 2.4 Desktop-first, tablet-ready

De eerste versie richt zich op desktop en grote tablets.

De interface moet responsive zijn, maar een telefooninterface hoeft niet dezelfde volledige tafel tegelijk te tonen. Een echte React Native-app is een latere fase.

### 2.5 Platformonafhankelijke domeinlogica

Domeinmodellen, reducers, actions, selectors, importnormalisatie en savegameformaten mogen niet afhankelijk zijn van DOM-, browser- of React-componenten.

Ze moeten later herbruikbaar zijn in een Expo/React Native-app.

### 2.6 Offline en online zijn uitvoeringsmodi

Maak het onderscheid expliciet:

```ts
type GameMode = "offline" | "online";
```

* In `offline` is de lokale game-state leidend en zijn login, Firebase en Cloudflare niet nodig.
* In `online` is de serverstate leidend en bevat Redux uitsluitend de toegestane clientweergave.
* Bouw geen tweede game-engine. Deel pure modellen, commando’s en transities waar veilig, maar gebruik aparte dispatchers/adapters voor lokaal en online uitvoeren.
* Een online fout of ontbrekende configuratie mag offline gebruik nooit onbruikbaar maken.

## 3. Aanbevolen stack

Gebruik voor de webapp:

* React;
* TypeScript met `strict: true`;
* Vite;
* Redux Toolkit en React Redux;
* dnd kit voor web drag-and-drop;
* IndexedDB via een dunne repositorylaag;
* een service worker/PWA-oplossing voor app-shell en assetcaching;
* Vitest en React Testing Library;
* Playwright voor kritieke gebruikersflows;
* ESLint en formattering volgens de bestaande repositoryconventies.

Gebruik geen Next.js tenzij de bestaande repository daar al bewust op is ingericht en migratie meer risico dan voordeel oplevert. SSR is niet nodig voor de battle-interface.

Gebruik voor de online uitbreiding bij voorkeur:

* Firebase Authentication voor identiteit, inclusief optionele anonieme login;
* een Cloudflare Worker in TypeScript voor HTTP-API, tokenvalidatie, lobby-routing en WebSocket-upgrades;
* één SQLite-backed Lobby Durable Object voor lobbymetadata en deelname;
* één SQLite-backed Game Durable Object per actieve game;
* WebSocket Hibernation voor langdurige verbindingen met lage idle-kosten;
* gedeelde TypeScript-contracten met runtimevalidatie, bijvoorbeeld Zod.

Gebruik geen D1, Firebase Realtime Database of Cloudflare Access/RBAC voor
spelers. Firebase Authentication is uitsluitend de identity provider; de
Worker en Durable Objects bepalen zelf host-, speler- en spectatorrollen.

## 4. Gewenste repositorystructuur

Wanneer de repository leeg of eenvoudig te herstructureren is, heeft een workspace/monorepo de voorkeur:

```text
apps/
  web/
  import-worker/
  game-worker/
packages/
  game-core/
  game-protocol/
  store/
  archidekt-client/
  persistence/
  shared-ui/
```

Betekenis:

* `apps/web`: React-webapp en webspecifieke interacties.
* `apps/import-worker`: kleine proxy/BFF voor externe deckimport; mag later met `game-worker` worden samengevoegd wanneer dat de bestaande deployment vereenvoudigt.
* `apps/game-worker`: Cloudflare Worker, Firebase-tokenvalidatie, lobby-API en SQLite-backed Durable Objects.
* `packages/game-core`: pure TypeScript-domeinlogica.
* `packages/game-protocol`: gedeelde, runtime-gevalideerde commands en serverberichten zonder geheime serverstate.
* `packages/store`: Redux Toolkit-configuratie, slices en selectors.
* `packages/archidekt-client`: URL-parser, externe response-schema’s en normalisatie.
* `packages/persistence`: interfaces en implementaties voor savegames, decks en offlinepakketten.
* `packages/shared-ui`: alleen echt platformneutrale tokens en eenvoudige presentatielogica; geen geforceerde volledige UI-deling.

De huidige repository volgt deze grens met `apps/web`, `apps/import-worker`,
`apps/game-worker`, `packages/game-core` en `packages/game-protocol`. Houd
frontendconfiguratie en browsercode onder `apps/web`; gedeelde pure domeincode
mag niet terug naar de webapp worden verplaatst.

## 5. Domeinmodel

### 5.1 Kaartdefinitie en kaartinstantie

Maak expliciet onderscheid tussen een kaartdefinitie en een kaartinstantie.

Een kaartdefinitie beschrijft de kaart:

```ts
interface CardDefinition {
  id: string;
  name: string;
  scryfallId?: string;
  oracleId?: string;
  layout?: string;
  faces: CardFaceDefinition[];
  imageRefs: CardImageRef[];
  oracleText?: string;
  typeLine?: string;
}
```

Een kaartinstantie beschrijft één fysiek exemplaar in een game:

```ts
interface CardInstance {
  instanceId: string;
  definitionId: string;
  ownerId: PlayerId;
  controllerId: PlayerId;
  zone: Zone;
  tapped: boolean;
  faceDown: boolean;
  activeFaceIndex: number;
  counters: Record<string, number>;
  attachedTo?: string;
  position?: BattlefieldPosition;
}
```

Gebruik nooit een Archidekt-, Oracle- of Scryfall-ID als unieke game-instance-ID.

### 5.2 Genormaliseerde state

Bewaar kaartinstanties centraal:

```ts
cardsById: Record<CardInstanceId, CardInstance>
```

Zones bevatten alleen instance-ID’s:

```ts
interface PlayerZones {
  library: CardInstanceId[];
  hand: CardInstanceId[];
  battlefield: CardInstanceId[];
  graveyard: CardInstanceId[];
  exile: CardInstanceId[];
  command: CardInstanceId[];
}
```

Dupliceer geen volledige kaartobjecten in verschillende zones.

### 5.3 Game-acties

Alle blijvende gamewijzigingen lopen via expliciete domeinacties, bijvoorbeeld:

* `startGame`;
* `drawCard`;
* `moveCard`;
* `tapCard`;
* `untapCard`;
* `setCardCounter`;
* `changeLife`;
* `changePoison`;
* `changeCommanderTax`;
* `changeCommanderDamage`;
* `createToken`;
* `shuffleLibrary`;
* `mulligan`;
* `nextPhase`;
* `nextTurn`;
* `undo`;
* `redo`.

Componenten mogen niet rechtstreeks geneste game-state muteren.

### 5.4 Spelers en multiplayer

Modelleer spelers als een collectie en niet als vaste velden:

```ts
type PlayerId = string;

interface GameState {
  mode: GameMode;
  players: Record<PlayerId, PlayerState>;
  turnOrder: PlayerId[];
  activePlayerId: PlayerId;
}
```

* De domeinlaag mag nergens aannemen dat er exact twee spelers zijn.
* Ondersteun technisch 2 tot 6 spelers; Commander gebruikt standaard 4.
* De bestaande offline UI mag gefaseerd nog een tweespelerlayout gebruiken, zolang game-core, persistence en protocol niet op twee spelers worden vastgezet.
* Bereid `player` en `spectator` als afzonderlijke verbindingsrollen voor.

### 5.5 Commands versus state

De offline dispatcher mag bestaande Redux-actions uitvoeren. De online client stuurt uitsluitend intenties/commands naar de server, bijvoorbeeld `DRAW_CARD`, `MOVE_CARD` of `CHANGE_LIFE`.

Stuur online nooit de volledige Redux-state als wijzigingsverzoek. Ieder command bevat minimaal een type, command-ID en `expectedVersion`. Het Durable Object valideert de structurele invarianten, past de officiële state toe en verhoogt de versie. Bouw hierbij geen volledige Magic-regelsimulator.

## 6. Redux-regels

Redux Toolkit beheert:

* actieve game-state;
* spelers en zones;
* kaartinstanties;
* turn/phase;
* blijvende kaartposities;
* actiegeschiedenis;
* undo/redo;
* relevante battle-UI-state die meerdere componenten nodig hebben.

Redux beheert niet rechtstreeks:

* iedere cursorpositie tijdens slepen;
* iedere animatiefase;
* vluchtige hoverstatus die maar één component gebruikt;
* binaire kaartafbeeldingsdata;
* duurzame databaseopslag.

Tijdens drag-and-drop blijft tijdelijke pointerpositie lokaal of in de drag-library. Dispatch één definitieve actie bij drop.

Gebruik memoized selectors om onnodige rerenders van kaarten en volledige spelersborden te voorkomen.

## 7. Persistence en autosave

### 7.1 Repositorylaag

Gebruik interfaces, bijvoorbeeld:

```ts
interface GameRepository {
  save(game: PersistedGame): Promise<void>;
  get(id: string): Promise<PersistedGame | null>;
  list(): Promise<PersistedGameSummary[]>;
  delete(id: string): Promise<void>;
}
```

Redux mag niet rechtstreeks IndexedDB aanroepen vanuit reducers.

Gebruik listener middleware, thunks of een applicatieservice voor persistence.

### 7.2 Autosave

Sla na iedere relevante domeinactie automatisch op, met debounce/batching om overmatige writes te voorkomen.

Minimaal opslaan:

* volledige game snapshot;
* savegame-schema-versie;
* deck snapshot-ID’s;
* actiegeschiedenis voor undo/redo binnen een redelijke limiet;
* laatste wijzigingsmoment.

Hydrateer Redux bij opstarten vanuit lokale opslag.

### 7.3 Migraties

Alle duurzame gegevens hebben een expliciete schemaversie.

Voeg migratiefuncties toe zodra het savegameformaat verandert. Breek bestaande lokale games niet stilzwijgend.

### 7.4 Online state en reconnect

Online state heeft een andere bron van waarheid dan offline state:

* het Game Durable Object bewaart de officiële actieve wedstrijdstate in
  geheugen en persistente snapshots in zijn eigen SQLite-opslag;
* het Lobby Durable Object bewaart lobby- en deelnemersmetadata in zijn eigen
  SQLite-opslag, nooit geheime actieve hand/library-state;
* de browser mag reconnectmetadata en de laatst ontvangen view cachen, maar behandelt die niet als officiële serverstate;
* na reconnect vraagt de client een verse persoonlijke snapshot en verwerkt daarna versioned events;
* offline savegames en online metadata gebruiken afzonderlijke repositoryinterfaces.

## 8. Archidekt-import

### 8.1 Ondersteunde invoer

Start met openbare Archidekt-deck-URL’s.

Accepteer varianten met of zonder deckslug, zolang een geldig numeriek deck-ID kan worden herkend.

Private decks en Archidekt-authenticatie vallen buiten de MVP.

### 8.2 Proxy/BFF

De webapp mag niet overal rechtstreeks afhankelijk zijn van de externe Archidekt-response.

Gebruik bij voorkeur een kleine Cloudflare Worker of vergelijkbare serverloze proxy:

```text
GET /api/import/archidekt/:deckId
```

De proxy:

* valideert het deck-ID;
* gebruikt time-outs;
* beperkt responsegrootte;
* voorkomt open-proxygedrag;
* past caching toe waar verantwoord;
* vertaalt externe fouten naar een stabiel intern foutformaat;
* retourneert bij voorkeur al een intern importcontract.

Sla geen secrets in de frontend op.

### 8.3 Adapter

Verberg het externe schema achter een adapter:

```text
Archidekt response
  -> runtime-validatie
  -> Archidekt adapter
  -> ImportedDeck
  -> DeckSnapshot
  -> Game setup
```

Verspreid geen paden uit de externe JSON door componenten of reducers.

### 8.4 Deck snapshots

Na import wordt een lokale, onveranderlijke snapshot gemaakt.

Een bestaande of lopende game verandert nooit automatisch wanneer het brondeck later op Archidekt wijzigt.

Bied later alleen een expliciete actie aan om opnieuw te importeren.

## 9. Kaartafbeeldingen en assets

### 9.1 Resolutie

Gebruik één normale resolutie voor battlefield en preview in de MVP, tenzij metingen aantonen dat een extra thumbnailvariant duidelijk voordeel biedt.

### 9.2 Dedupe

Dedupliceer assets op stabiele kaart/face/variant-sleutel, bijvoorbeeld:

```text
{scryfallId}:{faceIndex}:{imageVariant}
```

Download een kaartafbeelding niet opnieuw voor iedere kaartinstantie.

### 9.3 Dubbelzijdige kaarten

Ondersteun meerdere faces expliciet. Download beide zijden voor een offlinepakket.

### 9.4 Tokens

Download betrouwbare, bekende tokens en emblems die vanuit kaartdata te bepalen zijn.

Wanneer een tokenafbeelding ontbreekt, moet een functionele tekstuele/generieke tokenweergave beschikbaar zijn.

### 9.5 Fallback

Een ontbrekende of mislukte afbeelding mag de game niet blokkeren.

Toon minimaal:

* kaartnaam;
* type indien bekend;
* relevante status zoals tapped/counters;
* een knop of automatische retry zodra internet terug is.

## 10. Offlinepakketten

### 10.1 Verschil tussen cache en offlinepakket

* Tijdelijke cache mag automatisch worden opgeschoond.
* Een expliciet offlinepakket wordt alleen verwijderd door gebruikersactie of een duidelijke migratie/herstelactie.

### 10.2 Offlinepakketmanifest

Gebruik een manifest, bijvoorbeeld:

```ts
interface OfflineBattlePackage {
  id: string;
  version: number;
  title: string;
  deckSnapshotIds: [string, string];
  assetIds: string[];
  currentGameId?: string;
  status: "queued" | "downloading" | "paused" | "complete" | "failed";
  totalAssets: number;
  completedAssets: number;
  totalBytes?: number;
  downloadedBytes?: number;
  createdAt: string;
  updatedAt: string;
}
```

### 10.3 Downloadgedrag

De download moet:

* voortgang tonen;
* per bestand status opslaan;
* mislukte bestanden opnieuw kunnen proberen;
* na app- of browserherstart ontbrekende bestanden kunnen vervolgen;
* annuleren ondersteunen;
* zo mogelijk opslaggrootte vooraf of tijdens het proces tonen;
* voorkomen dat dezelfde asset dubbel wordt opgeslagen.

### 10.4 Webopslag

Gebruik voor de webapp:

* service worker voor app-shell en fetchstrategie;
* IndexedDB voor metadata, decks, games, manifests en downloadstatus;
* Cache API en/of geschikte origin-private opslag voor kaartassets;
* de Storage Persistence API waar beschikbaar, met een eerlijke status in de UI.

Vertrouw niet op alleen `localStorage`.

### 10.5 Netwerkstatus

Gebruik netwerkstatus alleen als hint. Een apparaat kan “online” zijn terwijl de externe bron onbereikbaar is.

Elke network request moet een eigen loading-, timeout-, retry- en foutpad hebben.

## 11. Drag-and-drop en battlefield

Gebruik dnd kit voor webinteracties.

Ondersteun in de eerste bruikbare versie minimaal:

* hand naar battlefield;
* battlefield naar graveyard;
* battlefield naar exile;
* command zone naar battlefield;
* kaarten binnen battlefield verplaatsen;
* tap/untap;
* z-index/voorgrondgedrag;
* een foutieve actie ongedaan maken.

Bewaar battlefieldposities genormaliseerd ten opzichte van het bord waar mogelijk, zodat layouts beter schaalbaar zijn tussen schermgroottes.

Gebruik geen Redux-dispatch voor iedere pointerbeweging.

## 12. UX-richtlijnen

### 12.1 Tafelindeling

Render één herbruikbare `PlayerBoard` voor iedere speler:

```tsx
<BattleTable>
  {turnOrder.map((playerId) => (
    <PlayerBoard key={playerId} playerId={playerId} />
  ))}
</BattleTable>
```

De huidige tweespelerlayout mag een gespecialiseerde compositie blijven, maar maak geen los gekopieerde spelerimplementaties. Voeg voor online Commander een schaalbare 2–6-spelerweergave toe, bijvoorbeeld met een actieve-spelerfocus en compacte tegenstanderborden.

### 12.2 Spelerfuncties

Ondersteun uiteindelijk:

* life;
* poison;
* commander tax;
* commander damage;
* library count;
* draw;
* draw X;
* mill X;
* shuffle;
* mulligan;
* untap all;
* next phase;
* next turn.

Bouw dit gefaseerd. Houd de eerste verticale slice klein en werkend.

### 12.3 Kaartinteracties

Streef naar:

* slepen om te verplaatsen;
* dubbelklik voor tap/untap op desktop;
* contextmenu voor aanvullende acties;
* hoverpreview op desktop;
* selecteerbare kaarten;
* later multiselect en groepering.

Voorzie touchvriendelijke alternatieven; vertrouw niet uitsluitend op hover, rechtermuisknop of toetsenbord.

### 12.4 Offline-UI

Toon duidelijk:

* online/offline status;
* autosave-status;
* of een battle volledig offline beschikbaar is;
* voortgang van assetdownload;
* gebruikte opslagruimte indien beschikbaar;
* laatste lokale opslagdatum;
* acties: spelen, bijwerken, hervatten, verwijderen, cache legen.

### 12.5 Hoofdmenu en online-UI

Het hoofdmenu bevat minimaal:

* **Offline spelen** — direct beschikbaar zonder login;
* **Online spelen** — login, lobbylijst, game aanmaken en deelnemen met code;
* **Decks beheren**;
* **Spel hervatten** — offline en online duidelijk gescheiden;
* **Instellingen**.

Online schermen tonen verbindingsstatus, spelerbezetting, host, formaat, zichtbaarheid en join/start-status. Een ontbrekende backendconfiguratie levert een nette lege/foutstatus op en blokkeert offline routes niet.

## 13. Toegankelijkheid

Drag-and-drop mag niet de enige manier zijn om kaarten te verplaatsen.

Voorzie minimaal een toegankelijk kaartactiemenu waarmee dezelfde zoneverplaatsingen uitvoerbaar zijn.

Verder:

* semantische knoppen;
* zichtbare focus;
* toetsenbordbediening waar praktisch;
* voldoende contrast;
* alt-tekst voor kaartafbeeldingen;
* aria-live voor relevante import-, save- en downloadstatus;
* geen essentiële informatie uitsluitend via kleur.

## 14. Performance

Let speciaal op:

* honderden kaartcomponenten;
* grote afbeeldingen;
* twee gelijktijdige battlefields;
* drag overlays;
* Redux-selectorgranulariteit;
* autosavefrequentie;
* offline assetdeduplicatie.

Gebruik lazy loading voor afbeeldingen en previews. Meet eerst voordat complexe optimalisaties worden toegevoegd.

Voorkom dat één kaartactie het volledige speelveld onnodig rerendert.

## 15. Security en betrouwbaarheid

### 15.1 Algemeen

* Vertrouw externe API-data niet blind; valideer responses runtime.
* Sta alleen bekende externe hosts en routes toe in de importproxy.
* Bouw geen generieke URL-fetchproxy.
* Beperk payloadgrootte en time-outs.
* Sanitize geen kaarttekst via ongecontroleerde HTML-rendering; render als tekst tenzij een veilige parser bewust is toegevoegd.
* Geen secrets in frontendcode of repository.
* Maak foutmeldingen bruikbaar zonder interne stacktraces of gevoelige details te tonen.

### 15.2 Server-authoritative online games

* Firebase Authentication levert identiteit; de Cloudflare Worker valideert ieder Firebase ID-token server-side en gebruikt uitsluitend de geverifieerde `uid`.
* Vertrouw nooit een `uid`, `playerId`, stoel of rol die alleen door de browser wordt meegestuurd.
* Gebruik voor browser-WebSockets bij voorkeur eerst een geauthenticeerde HTTPS-joinrequest en geef daarna een kortlevend, eenmalig socket-ticket uit.
* Eén Durable Object beheert één game met 2–6 spelers en eventuele spectators.
* Het Durable Object bewaart de volledige state, maar maakt per verbinding een persoonlijke view.
* Stuur naar iedere speler alleen publieke state, de eigen hand/zichtbare libraryinformatie en aantallen voor verborgen zones van anderen.
* Tegenstandershanden, libraryvolgorde en andere geheime metadata mogen nooit in hun Redux-store, HTML, WebSocketpayload of voorspelbare kaart-ID terechtkomen.
* Spectators krijgen standaard uitsluitend publieke informatie en kunnen geen gamecommands uitvoeren.
* Valideer commands runtime, beperk berichtgrootte en snelheid, controleer game-lidmaatschap, rol, versie, instance-ID en zone-invarianten.
* Client-side Redux is in online modus een view/cache. Lokale manipulatie verandert nooit de officiële serverstate.
* Encryptie-at-rest is geen productdoel voor speldata; besteed implementatietijd primair aan authenticatie, autorisatie, dataminimalisatie en server-clientintegriteit.

## 16. Teststrategie

### Unit tests

Test minimaal:

* Archidekt-URL-parsing;
* normalisatie van deckdata;
* kaartinstancegeneratie;
* commander(s) naar command zone;
* shuffle met injecteerbare/deterministische randombron;
* draw;
* zoneverplaatsingen;
* tap/untap;
* undo/redo;
* assetdeduplicatie;
* savegamemigraties.

### Component/integratietests

Test minimaal:

* importformulier met twee decks;
* foutstatus per deckslot;
* start game;
* kaartactiemenu;
* autosave-indicator;
* offline downloadvoortgang;
* hervatten na reload;
* hoofdmenu met werkende offline route zonder login;
* online loading-, empty-, auth- en foutstatussen;
* lobbyweergave voor 2–6 spelers;
* persoonlijke online state zonder verborgen tegenstanderkaarten.

### End-to-end

Kritieke flow:

1. Twee publieke testdecks importeren of betrouwbare fixtures gebruiken.
2. Battle starten.
3. Zeven kaarten per speler zien.
4. Een kaart naar battlefield verplaatsen.
5. Kaart tappen.
6. Leven aanpassen.
7. Pagina herladen.
8. Dezelfde toestand terugzien.
9. Battle offline downloaden.
10. Netwerkrequests uitschakelen.
11. App herladen en battle met afbeeldingen openen.

Gebruik fixtures/mocks in CI zodat tests niet afhankelijk zijn van beschikbaarheid of wijzigingen van externe diensten.

Voeg voor de online uitbreiding tests toe voor Firebase-tokenvalidatie, eenmalige socket-tickets, join/leave/reconnect, version conflicts, commandvalidatie en verschillende views voor speler A, speler B en spectator. Gebruik lokaal Miniflare/Wrangler of passende mocks; tests mogen geen productieproject of echte betaalde resource vereisen.

## 17. Buiten scope tenzij expliciet gevraagd

Bouw niet automatisch mee met de online uitbreiding:

* automatische Magic-regels;
* mana- of kaartlegaliteitsvalidatie tijdens spelen;
* automatische combat of triggers;
* skill-based matchmaking of ranking;
* chat, audio of video;
* cloudsync van volledige offline savegames;
* deckeditor;
* private Archidekt-authenticatie;
* Moxfield-import;
* App Store/Play Store-publicatie;
* volledige React Native-interface;
* monetisatie.

Openbare lobby’s, deelnemen met code, Firebase-login en realtime games met 2–6 spelers horen wél bij de huidige uitbreidingsrichting, maar bouw ze incrementeel.

## 18. Werkwijze voor coding agents

Voordat je implementeert:

1. Lees dit bestand volledig.
2. Inspecteer de bestaande repository, package manager, scripts, configuratie en tests.
3. Benoem kort welke bestaande keuzes je behoudt of corrigeert.
4. Geef een beknopt implementatieplan.
5. Voer het plan daarna uit zonder opnieuw toestemming te vragen.

Vraag alleen om menselijke invoer wanneer:

* een secret of externe login nodig is;
* een betaalde resource moet worden aangemaakt;
* een destructieve migratie noodzakelijk lijkt;
* twee productkeuzes werkelijk niet veilig uit de bestaande context af te leiden zijn.

Maak anders redelijke, gedocumenteerde keuzes en ga door.

Na wijzigingen:

* voer lint uit;
* voer typecheck uit;
* voer relevante tests uit;
* voer productiebuild uit;
* rapporteer welke commando’s zijn uitgevoerd en of ze slaagden;
* geef een korte lijst van gerealiseerde functionaliteit;
* vermeld openstaande beperkingen eerlijk;
* werk README en relevante architectuurdocumentatie bij.

## 19. Definition of Done voor iedere slice

Een slice is pas klaar wanneer:

* de gebruikersflow werkelijk via de UI werkt;
* state en persistence correct gescheiden zijn;
* fout-, loading- en lege toestanden bestaan;
* relevante tests aanwezig zijn;
* lint, typecheck en build slagen;
* er geen tijdelijke hardcoded productiegegevens of secrets zijn;
* de documentatie is bijgewerkt;
* bestaande opgeslagen data niet zonder waarschuwing wordt gebroken.

## 20. Eerste productmijlpaal

De eerste betekenisvolle mijlpaal is een end-to-end verticale slice waarin de gebruiker:

1. twee publieke Archidekt-URL’s invoert;
2. beide decks succesvol importeert;
3. een battle start;
4. twee handen van zeven kaarten krijgt;
5. kaarten tussen hand, battlefield en graveyard kan verplaatsen;
6. kaarten kan tappen en leven kan aanpassen;
7. na refresh exact verder kan;
8. de battle voor offline gebruik kan downloaden;
9. zonder netwerk de app en battle opnieuw kan openen.

Optimaliseer pas daarna richting uitgebreide counters, tokens, commander damage, multiselect, groepen en een native app.

## 21. Huidige uitbreidingsmijlpaal: online multiplayer

De volgende productmijlpaal voegt online functionaliteit toe zonder de bestaande offline ervaring te vervangen:

1. Hoofdmenu met offline spelen, online spelen, decks, hervatten en instellingen.
2. Offline routes blijven zonder account en zonder backend werken.
3. Firebase Authentication achter een `AuthService`-interface.
4. Lobbylijst, game aanmaken en deelnemen met code achter een `OnlineGameService`-interface.
5. Eén SQLite-backed Lobby Durable Object voor lobbymetadata en één
   SQLite-backed Game Durable Object per actieve game.
6. WebSocketprotocol met versioned commands en persoonlijke serverviews.
7. Online games ondersteunen 2–6 spelers en standaard 4 voor Commander.
8. Eerst mocks en duidelijke adapters; daarna echte Cloudflare- en Firebase-integratie zonder frontendcomponenten direct aan SDK’s te koppelen.

De specifieke online besluiten staan in `docs/architecture/006-online-multiplayer.md`. Gebruik voor de eerstvolgende coding-agentopdracht `ONLINE_MULTIPLAYER_PROMPT.md`.

## Visuele richting

Gebruik de referentieafbeelding `docs/reference/mtg-duelist-layout.png` als inspiratie voor de ruimtelijke opzet van de battle-interface.

Deze referentie is geen pixel-perfect voorbeeld dat letterlijk moet worden gekopieerd. Gebruik hem alleen om de globale compositie, zoneplaatsing en het gevoel van diepte te begrijpen.

De battle-interface moet:
- ruim en luchtig aanvoelen;
- visuele diepte gebruiken om meer speelruimte te suggereren;
- het midden van het battlefield vrij houden voor kaarten;
- nevenzones compact en logisch aan de randen plaatsen;
- overzichtelijk werken voor 2–6 spelers, met een sterke tweespelerweergave en een compacte Commander-layout voor vier spelers.
