# AGENTS.md — MTG Battle Mode

Lees dit bestand volledig voordat je wijzigingen maakt. Dit bestand is leidend voor architectuur, scope, kwaliteit en werkwijze.

## 1. Projectdoel

Bouw een onofficiële, lokale Magic: The Gathering Battle Mode waarmee één gebruiker twee geïmporteerde decks tegenover elkaar kan spelen.

De gebruiker bestuurt beide kanten van het speelveld. De applicatie is een digitale tafel en geen automatische Magic-regelsimulator.

De kernervaring:

1. Twee openbare Archidekt-deck-URL’s invoeren.
2. Beide decks importeren en normaliseren.
3. Een battle starten met twee gespiegeld weergegeven spelers.
4. Kaarten handmatig tussen zones verplaatsen.
5. Leven, counters, tapstatus, commander tax en commander damage bijhouden.
6. De game automatisch lokaal opslaan.
7. Een battle expliciet downloaden voor volledig offline gebruik, inclusief kaartafbeeldingen.
8. Een eerder opgeslagen battle zonder internet kunnen starten en hervatten.

## 2. Productprincipes

### 2.1 Local-first

Een gestarte game mag niet verloren gaan door een verbroken internetverbinding, refresh, crash of gesloten browser.

Internet is alleen noodzakelijk voor:

* het eerste importeren van een deck;
* het ophalen van nog niet lokaal beschikbare kaartafbeeldingen;
* het bewust controleren op een nieuwere deckversie.

Na import moeten deckdata en spelstatus lokaal beschikbaar blijven.

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

Gebruik geen Firebase voor de MVP. Accounts, cloud saves en online multiplayer vallen buiten de eerste scope.

## 4. Gewenste repositorystructuur

Wanneer de repository leeg of eenvoudig te herstructureren is, heeft een workspace/monorepo de voorkeur:

```text
apps/
  web/
  import-worker/
packages/
  game-core/
  store/
  archidekt-client/
  persistence/
  shared-ui/
```

Betekenis:

* `apps/web`: React-webapp en webspecifieke interacties.
* `apps/import-worker`: kleine proxy/BFF voor externe deckimport.
* `packages/game-core`: pure TypeScript-domeinlogica.
* `packages/store`: Redux Toolkit-configuratie, slices en selectors.
* `packages/archidekt-client`: URL-parser, externe response-schema’s en normalisatie.
* `packages/persistence`: interfaces en implementaties voor savegames, decks en offlinepakketten.
* `packages/shared-ui`: alleen echt platformneutrale tokens en eenvoudige presentatielogica; geen geforceerde volledige UI-deling.

Maak geen monorepo alleen om deze structuur letterlijk te volgen als de bestaande repository een goede andere basis heeft. Behoud dan dezelfde architectuurgrenzen binnen `src/`.

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

Render één herbruikbare `PlayerBoard` tweemaal:

```tsx
<BattleTable>
  <PlayerBoard playerId="player-2" orientation="opponent" />
  <PlayerBoard playerId="player-1" orientation="self" />
</BattleTable>
```

Maak geen twee los gekopieerde implementaties.

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

* Vertrouw externe API-data niet blind; valideer responses runtime.
* Sta alleen bekende externe hosts en routes toe in de importproxy.
* Bouw geen generieke URL-fetchproxy.
* Beperk payloadgrootte en time-outs.
* Sanitize geen kaarttekst via ongecontroleerde HTML-rendering; render als tekst tenzij een veilige parser bewust is toegevoegd.
* Geen secrets in frontendcode of repository.
* Maak foutmeldingen bruikbaar zonder interne stacktraces of gevoelige details te tonen.

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
* hervatten na reload.

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

## 17. Buiten scope van de eerste versie

Bouw niet zonder expliciete nieuwe opdracht:

* automatische Magic-regels;
* mana- of legaliteitsvalidatie tijdens spelen;
* online realtime multiplayer;
* matchmaking;
* accounts en cloud sync;
* chat of video;
* vier spelers;
* deckeditor;
* private Archidekt-authenticatie;
* Moxfield-import;
* App Store/Play Store-publicatie;
* volledige React Native-interface;
* monetisatie.

Ontwerp grenzen wel zo dat later uitbreiden mogelijk blijft.

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
