# Codex Feature 1 — Firestore Deck Library en expliciete CRUD

## Lees eerst

Lees volledig:

- `AGENTS.md`
- `ROADMAP.md`
- `docs/architecture/001-local-first-boundaries.md`
- `docs/architecture/006-online-multiplayer.md`
- `docs/architecture/009-graphql-application-api.md`
- `docs/architecture/010-provider-agnostic-deck-import.md`
- `docs/architecture/013-deck-library-and-explicit-refresh.md`
- `docs/architecture/016-firestore-deck-library.md`
- `docs/security/firebase-app-check.md`
- `docs/security/firestore-deck-library.md`

Inspecteer daarna de actuele code. Behoud bestaande werkende architectuur waar
zij niet strijdig is met ADR 013/016. Implementeer uitsluitend Feature 1 uit
`ROADMAP.md`; begin nog niet aan Moxfield of ManaBox.

## Hoofddoel

Maak `/decks` de duurzame cloud Deck Library. Firestore bewaart user-owned decks;
Cloudflare blijft verantwoordelijk voor auth/application-API, providerimports en
realtime gameplay.

De nieuwe lifecycle is eenvoudige CRUD:

```text
Import/Create -> provider ophalen -> normaliseren -> Firestore opslaan
Read          -> Firestore library/content lezen
Update        -> expliciete knop -> provider opnieuw ophalen -> vervangen
Delete        -> library-entry + actuele content verwijderen
```

Er is geen `sourceHash`/contentfingerprint meer nodig in het doelmodel.

## Bestaande code die je expliciet moet inspecteren

Begin onder andere bij:

- `apps/web/src/features/menu/DecksScreen.tsx`
- `apps/web/src/features/online/LobbyRoomScreen.tsx`
- `apps/web/src/features/setup/`
- `apps/web/src/persistence/database.ts`
- `apps/web/src/persistence/repositories.ts`
- `apps/web/src/features/decks/deckSnapshots.ts`
- `apps/web/src/app/api/importDeck.ts`
- `apps/web/src/app/api/operations.graphql`
- `apps/game-worker/src/graphql/`
- `apps/game-worker/src/index.ts`
- `apps/game-worker/src/lobby-durable-object.ts`
- `apps/import-worker/src/deck-import-service.ts`
- `packages/game-core/src/types.ts`
- `packages/deck-source/`
- Firebase runtimeconfig, App Check en bestaande authhelpers.

Zoek repositorybreed naar `sourceHash`, fingerprinthelpers, cache-statuscontracten
en client-side freshnesscalls voordat je iets verwijdert. De migratie moet alle
actieve contracten en tests bewust aanpassen.

## Productrequirements

### 1. Deck Library UX

Maak `/decks` collectiegericht en merkbaar verzorgder dan een simpele beheer-lijst.
Gebruik binnen de bestaande visuele taal deckcards/tiles met minimaal:

- decknaam;
- providerbadge;
- commander/samenvatting waar beschikbaar;
- kaartenaantal;
- laatste succesvolle import/update;
- acties **Update** en **Verwijderen**;
- primaire actie **+ Deck toevoegen**.

Desktop moet een premium collectiegevoel hebben; small screens vloeien logisch
terug. Loading-, empty-, error- en successstates zijn expliciet en keyboard-/
screenreaderbruikbaar.

### 2. Add wizard

`+ Deck toevoegen` opent een wizard met minimaal:

1. providerselectie;
2. URL/deckreferentie;
3. import/validatiestatus;
4. succes/resultaat.

Providerselectie is uitbreidbaar zonder provider-if-statements door alle UI.
Archidekt is in deze feature de enige echte provider. Moxfield/ManaBox mogen als
capability/unavailable getoond worden, maar niet worden aangesloten.

### 3. Firestore persistence en loadverdeling

Implementeer ADR 016. Gebruik Cloud Firestore als duurzame cloud source of truth
voor owner-scoped decks.

Houd lijstmetadata los van volledige deckcontent, conceptueel:

```text
users/{uid}/decks/{deckKey}
users/{uid}/decks/{deckKey}/content/current
```

Pas exacte velden aan het bestaande provider-neutrale model aan; sla geen raw
providerresponse op.

Doelgedrag:

- `/decks` kan kleine metadata owner-scoped rechtstreeks uit Firestore lezen;
- volledige content wordt alleen gelezen wanneer nodig;
- Firebase Authentication bepaalt `uid`;
- Firestore Security Rules staan alleen ownerreads toe;
- App Check wordt meegenomen in de native Firestore-readgrens;
- browser krijgt geen vrije authoritative Create/Update/Delete naar clouddecks;
- Cloudflare bewaart geen permanente schaduwkopie van dezelfde Deck Library.

Maak een kleine Firestore repository/port in plaats van Firestorecalls door React
componenten te verspreiden.

### 4. Server-authoritative mutations

Create, Update en Delete lopen via de bestaande beschermde application-API/Game
Worker-grens. Hergebruik de bestaande Firebase ID-token- en App Check-validatie.

De server:

- bepaalt owner uitsluitend uit de geverifieerde Firebase UID;
- accepteert geen willekeurig Firestore user/documentpath uit clientinput;
- roept voor import/update de Import Worker/providergrens aan;
- valideert/normaliseert eerst volledig;
- schrijft daarna metadata + actuele content consistent naar Firestore;
- laat bij fout de vorige geldige versie intact.

Gebruik voor server-side Firestoretoegang een officieel ondersteunde REST/IAM- of
gelijkwaardige serverroute. Als een service-accountcredential nodig is, behandel
die als runtime serversecret. Nooit committen, nooit aan frontend/runtime-config
geven en nooit loggen.

Documenteer de gekozen serverauthmethode kort in de relevante ADR/securitydoc
nadat zij werkelijk is geïmplementeerd.

### 5. Duplicate-regel zonder hash

De authoritatieve identiteit is:

```text
uid + provider + externalDeckKey
```

Gebruik bij voorkeur een deterministische, Firestore-veilige `deckKey` uit
`provider + externalDeckKey`, zodat gelijktijdige Creates race-safe niet twee
records kunnen opleveren. Een reversible/base64url-achtige veilige encoding is
prima; gebruik geen contenthash als productmechanisme.

Een tweede Create retourneert stabiel `DECK_ALREADY_IMPORTED`; UI verwijst naar
**Update**.

### 6. `sourceHash` volledig uit actieve flow verwijderen

Feature 1 verwijdert `sourceHash` uit het doelmodel, niet alleen uit freshness-
logica.

Verwijder/migreer waar van toepassing:

- frontendberekening en extra freshness/fingerprintcall;
- GraphQL input/outputvelden die alleen hiervoor bestaan;
- `ImportedDeck.sourceHash` en vergelijkbare actieve domainvelden;
- import-worker fingerprintberekening/-vergelijking;
- persistence-indexen/sleutels die hash als deckidentiteit gebruiken;
- tests/fixtures/generated types/persisted operations die de hash verwachten;
- cachebeslissingen `clientHash == sourceHash`.

Doe dit via bestaande IndexedDB/schema-/savegame-migraties zodat oude lokale data
niet onnodig crasht. Legacy waarden mogen tijdens migratie genegeerd/verwijderd
worden; introduceer geen nieuw hashveld om compatibiliteit kunstmatig in stand te
houden.

Na afloop mag een repositorysearch naar `sourceHash` alleen nog voorkomen in
historische documentatie/migratiecommentaar waar dat bewust nodig is. Nieuwe
runtimecode mag er niet van afhangen.

### 7. Update-regel

Een provider wordt alleen opnieuw benaderd na een expliciete **Update**.

Bij succes:

- provider opnieuw ophalen;
- volledig valideren/normaliseren;
- actuele content en afgeleide metadata vervangen;
- `updatedAt`/`importedAt` aanpassen.

Bij fout:

- oude metadata/content behouden;
- bruikbare foutmelding tonen;
- geen gedeeltelijke write.

Geen automatische polling, fingerprintvergelijking of refetch bij game-start.

### 8. Delete-regel

Delete verwijdert de actuele cloudlibrary-entry en bijbehorende current content
via een gecontroleerde servermutation. Firestore verwijdert subcollections niet
impliciet wanneer alleen een parentdocument verdwijnt; ruim daarom alle actuele
records bewust op en test partial-failuregedrag.

Een reeds gestarte Game Durable Object of expliciet offlinepakket blijft zijn
snapshot behouden.

### 9. Online lobby/game-start

In `LobbyRoomScreen`:

- geen “Nieuw deck importeren…” optie;
- geen provider-URL-input;
- geen deck verwijderen;
- alleen reeds opgeslagen decks selecteren;
- zonder decks: uitleg + `AppLink` naar `/decks`.

Bij online game-start stuurt de client alleen de gekozen `deckKey`. De server
controleert ownership en leest de authoritative huidige snapshot uit Firestore.
Accepteer geen door de client aangeleverde volledige deckinhoud als authoritative
online snapshot.

Na initialisatie staat de battle-state in het Game Durable Object en is Firestore
niet nodig voor normale gamecommands. Een latere Update van het librarydeck mag
een lopende game niet muteren.

### 10. Offline grens

Behoud de local-first/offline flow. IndexedDB mag lokale/offline data blijven
bewaren en later een expliciete lokale kopie van clouddecks cachen, maar het is
niet de cloud source of truth. Maak Feature 1 niet afhankelijk van online login
voor bestaande pure offline battles.

## Buiten scope

- echte Moxfield-integratie;
- Moxfield queue;
- ManaBox-private package;
- deckeditor;
- automatische providerpolling;
- D1 als tweede Deck Library;
- volledige cloudsync van alle offline savegames;
- grote redesign van battle UI;
- ongerelateerde refactors.

## Securitytests

Test minimaal:

- user A kan user B library/content niet lezen;
- unauthenticated Firestore reads falen;
- normale browserwrites naar authoritative clouddecks falen;
- servermutations construeren ownerpath uit geverifieerde UID;
- service-account/runtimecredential verschijnt niet in logs/clientbundle/config;
- online game-start kan geen client-crafted snapshot gebruiken.

Gebruik Firestore Emulator/Rules tests waar praktisch. CI gebruikt geen
productie-Firestoredata en geen echte providerrequests buiten expliciet toegestane
mock-/fixturegrenzen.

## Functionele/migratietests

Voeg minimaal tests toe voor:

- Deck Library empty/list/read-detail states;
- metadata listing laadt niet onnodig volledige content;
- wizard providerselectie en Archidekt success/failure;
- duplicate Create en race-/herhaalgedrag;
- Update alleen op user action;
- mislukte Update bewaart oude content;
- Delete ruimt actuele metadata/content op;
- `sourceHash`-migratie uit IndexedDB/domain/API zonder extra frontendcall;
- oude savegame/offline data blijft bruikbaar waar ondersteund;
- online lobby met decks: alleen selectie;
- online lobby zonder decks: link naar `/decks`;
- lobby kan geen import/delete meer starten;
- game-start haalt authoritative content server-side op;
- reeds gestarte game verandert niet na library Update/Delete.

Gebruik provider mocks/fixtures; CI benadert geen externe provider.

## Verificatie

Voer minimaal uit:

```sh
npm run format:check
npm run lint
npm run type-check
npm test
npm run build
npm run deploy:cloudflare:check
```

Voer daarnaast relevante Firestore Rules/emulator- en Playwright-flow(s) uit
wanneer de lokale testomgeving beschikbaar is. Corrigeer fouten voordat je
afrondt.

## Afronding

Werk `README.md`, `ROADMAP.md`, ADR 013/016 en securitydocs alleen bij voor wat
werkelijk is geïmplementeerd. Markeer Feature 1 pas als gerealiseerd wanneer de
volledige Definition of Done is gehaald.

Rapporteer kort:

1. gekozen Firestore repository-/serverauthgrens;
2. gerealiseerde Deck Library UX;
3. `sourceHash`-verwijdering en migraties;
4. Security Rules/App Check wijzigingen;
5. uitgevoerde tests/commando's;
6. bekende beperkingen;
7. of Feature 2 veilig kan starten.
