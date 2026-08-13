# Roadmap — Deck Library en nieuwe deckproviders

Laatst bijgewerkt: 13 augustus 2026.

Deze roadmap beschrijft de eerstvolgende vier productfeatures rond deckbeheer en
providerimports. De volgorde is bewust: eerst wordt de gebruikersflow en de
Firestore-backed cloud source of truth gestabiliseerd, daarna wordt de
beschermingslaag voor de meest
beperkte provider gebouwd, vervolgens wordt die provider aangesloten en pas als
laatste wordt de private-providergrens voor ManaBox geïntegreerd.

> [!IMPORTANT]
> Deze publieke roadmap bevat bewust geen vertrouwelijke providercredentials,
> niet-openbare upstreamadressen, private responseschema's, network captures of
> andere informatie waarmee een niet-publieke providerinterface kan worden
> gereconstrueerd. Zie `docs/architecture/012-confidential-provider-adapters.md`.

## Doelbeeld

```text
React Web
   │
   ├── /decks ───────────────► Firestore Deck Library
   │   read metadata/content       ▲
   │                               │ authoritative CRUD
   │                               │
   │                         Game/Application Worker
   │                               │
   │                         Import Worker
   │                               │
   │                  ┌────────────┼─────────────┐
   │                  │            │             │
   │             Archidekt     Moxfield       ManaBox
   │                               │             │
   │                          globale FIFO    private adapter
   │
   └── Online game ── selecteert deckKey ──► server snapshot ──► Game DO
```

De Deck Library wordt de beheerplek voor imports en duurzame clouddeckdata.
Firestore draagt gewone libraryopslag/-reads; Cloudflare draagt provider-,
mutation-, queue- en realtimewerk. Online game-start mag geen nieuwe
providerimport uitvoeren en gameplay gebruikt na initialisatie zijn eigen
provider-neutrale snapshot.

## Feature 1 — Firestore Deck Library, importwizard en expliciete CRUD

**Prioriteit:** eerst uitvoeren.

**Voorgestelde branch:** `feature/deck-library-import-wizard`

Bouw `/decks` uit tot een volwaardige, owner-scoped Deck Library. Firestore
wordt de duurzame cloud source of truth voor opgeslagen decks; Cloudflare blijft
verantwoordelijk voor providerrequests, mutations, security en realtime gameplay.
Deze verdeling spreidt gewone libraryreads/storage over Firebase en houdt de
Cloudflarelaag gericht op coördinatie en execution.

Zie [ADR 016](docs/architecture/016-firestore-deck-library.md) voor de bindende
opslag- en loadverdeling.

De gebruiker kan:

- opgeslagen decks bekijken in een verzorgde collectie-interface;
- een deck toevoegen via een wizard met providerselectie;
- een deck handmatig bijwerken via **Update**;
- een deck verwijderen met bevestiging;
- provider, commander/samenvatting, kaartenaantal en laatste update zien;
- duidelijke loading-, queued-, success-, empty- en foutstatussen zien.

### Firestore als cloud Deck Library

Voor ingelogde/online owners wordt de duurzame library in Cloud Firestore
opgeslagen onder de geverifieerde Firebase-UID. Gebruik kleine metadata los van
de volledige huidige genormaliseerde deckinhoud, conceptueel:

```text
users/{uid}/decks/{deckKey}
  provider / externalDeckKey / sourceUrl
  name / format / commanderSummary / cardCount
  createdAt / updatedAt

users/{uid}/decks/{deckKey}/content/current
  cards / definitions / importedAt
```

De Deck Library mag owner-scoped metadata rechtstreeks uit Firestore lezen onder
Firebase Authentication, Security Rules en App Check. Create, Update en Delete
blijven server-authoritative en lopen via de beschermde application-API. De
browser krijgt geen vrije authoritative Firestore-writeflow.

Cloudflare bewaart geen tweede permanente kopie van dezelfde Deck Library in D1
of een Durable Object. IndexedDB blijft lokale/offline opslag/cache en is niet de
cloud source of truth.

### Importwizard

De wizard volgt minimaal deze stappen:

1. provider kiezen;
2. publieke deckreferentie/URL invoeren;
3. valideren en import starten;
4. resultaat bevestigen en terugkeren naar de Deck Library.

In de eerste slice blijft Archidekt de daadwerkelijk werkende provider. Moxfield
en ManaBox mogen zichtbaar worden als geplande/uitgeschakelde provider wanneer
dat UX-technisch nuttig is, maar hun echte integratie hoort niet in Feature 1.

### Eenvoudige CRUD; `sourceHash` verwijderen

De nieuwe library gebruikt expliciete CRUD-semantiek:

```text
Import/Create -> provider ophalen -> normaliseren -> opslaan
Read          -> opgeslagen Firestore deck/library lezen
Update        -> alleen na knopdruk provider opnieuw ophalen -> vervangen
Delete        -> library-entry + huidige content verwijderen
```

`sourceHash` is in dit doelbeeld niet meer nodig. Feature 1 verwijdert de
contentfingerprint uit de actieve frontend-, GraphQL-, persistence-, import- en
domeincontracten, inclusief client-side hash/freshnesscalls. Dit gebeurt als
beheerste migratie: inventariseer eerst alle bestaande afhankelijkheden en pas
fixtures/migraties/tests aan, maar behoud de hash niet als nieuwe productregel.

Technische caching mag later provider-neutraal worden toegepast wanneer dat
nuttig en toegestaan is, maar een cachehash bepaalt nooit deckidentiteit of of
een Update moet plaatsvinden.

### Deckidentiteit en duplicaten

Een gebruiker mag dezelfde externe deckbron niet tweemaal als afzonderlijk deck
opslaan. De stabiele identiteit is:

```text
uid + provider + externalDeckKey
```

Gebruik binnen de ownercollection bij voorkeur een deterministische,
Firestore-veilige `deckKey` op basis van `provider + externalDeckKey`, zodat twee
gelijktijdige Create-acties niet twee records kunnen opleveren. Dit is geen
inhoudshash en vereist geen frontendberekening of extra providercall.

Een tweede normale import faalt met `DECK_ALREADY_IMPORTED` en wijst de gebruiker
naar **Update**.

### Handmatige Update

Een deck wordt nooit automatisch bij de provider gecontroleerd. Alleen de knop
**Update** mag opnieuw providerdata ophalen.

Bij succes worden metadata en de huidige provider-neutrale content samen
vervangen. Bij timeout, ongeldige data of providerfout blijft het bestaande deck
ongewijzigd en bruikbaar. Een reeds gestarte game behoudt altijd de snapshot
waarmee die game is gestart.

### Online game-start

In een online lobby kan een speler uitsluitend een reeds opgeslagen deck kiezen.
De client stuurt alleen de geselecteerde library `deckKey`; de server controleert
ownership en haalt de authoritative snapshot uit Firestore voordat de Game
Durable Object wordt geïnitialiseerd.

Verwijder uit de lobby:

- de optie “Nieuw deck importeren…”;
- het provider-URL-formulier;
- deckverwijdering vanuit de lobby.

Heeft de gebruiker geen beschikbare decks, toon dan een duidelijke empty state
met een link naar `/decks` om eerst een deck toe te voegen. Het starten of
registreren van een online deck doet geen providerrequest. Na game-start is
Firestore niet nodig voor normale gameplay.

De bestaande pure offline setup mag compatibel blijven. Offline spelen zonder
Firebase/Cloudflare blijft mogelijk; ontwerp de Deck Library wel zo dat een
lokale cache/kopie van clouddecks later expliciet kan worden ondersteund.

### Definition of Done

- Firestore-backed cloud Deck Library is owner-scoped en heeft geteste Security
  Rules/authorisatiegrenzen.
- `/decks` leest kleine librarymetadata zonder voor de lijstweergave alle
  volledige deckcontent te hoeven laden.
- Authoritative Create/Update/Delete lopen via de server/application-API.
- Add-wizard werkt end-to-end met Archidekt.
- `sourceHash` en client-side fingerprint/freshnesscalls zijn uit de actieve
  Feature-1 contracten verwijderd via geteste migratie.
- Duplicate import wordt race-safe geweigerd op `uid + provider +
  externalDeckKey`.
- Update is expliciet en user-triggered; falen bewaart het oude deck.
- Delete verwijdert de actuele libraryrecords zonder reeds gestarte games of
  offlinepakketten kapot te maken.
- Online lobby selecteert alleen opgeslagen decks en importeert/verwijdert niet.
- Online game-start accepteert alleen een deck key en leest de snapshot
  server-side.
- Empty state verwijst naar `/decks`.
- Firebase en Cloudflare hebben één duidelijke source-of-truthgrens; er is geen
  dubbele permanente Deck Library in Cloudflare.
- Relevante unit-, component-, integratie-, Security Rules- en migratietests zijn
  aanwezig.
- Lint, typecheck, tests en production build slagen.

Leidend implementatiebestand voor Codex:
`docs/codex/01-deck-library.md`.

---

## Feature 2 — Globale Moxfield FIFO en abuse protection

**Afhankelijk van:** Feature 1.

**Voorgestelde branch:** `feature/moxfield-import-queue`

Bouw eerst de queue en alle veiligheidsinvarianten tegen een mock upstream.
Koppel in deze feature nog geen echte Moxfield-providerdata aan de applicatie.

### Queue-invarianten

- alle Moxfield **Import**- en **Update**-acties gebruiken exact dezelfde queue;
- één singleton queue-coördinator per deployment environment;
- FIFO-volgorde voor geaccepteerde jobs;
- nooit meer dan één Moxfield-upstreamrequest tegelijk;
- conservatieve minimumafstand van **1,1 seconde** tussen starts van
  upstreamrequests;
- maximaal één queued/actieve Moxfield-job per gebruiker;
- een **10 seconden per-user cooldown** op nieuwe Moxfield Import/Update-acties;
- een upstream-requesttimeout van maximaal **10 seconden**; een vastgelopen request mag de queue niet
  permanent blokkeren;
- provider- of rate-limitfouten mogen geen agressieve automatische retry-loop
  starten;
- de queue moet duurzaam genoeg zijn om Worker/DO-herstarts te overleven voor
  reeds geaccepteerde jobs.

Een singleton Durable Object is hiervoor de voorkeursrichting omdat de globale
serialisatie expliciet en testbaar moet zijn. Gebruik geen architectuur die per
Worker-isolate of per gebruiker afzonderlijk rate-limitt en daardoor gelijktijdige
upstreamcalls kan toelaten.

### UX-contract

Wanneer een Moxfield-job is geaccepteerd krijgt de client een stabiel job-ID en
status, bijvoorbeeld `queued`, `processing`, `completed` of `failed`. Toon waar
mogelijk de positie en een conservatieve wachttijd. Tijdens een openstaande job
wordt Moxfield voor die gebruiker uitgeschakeld zodat herhaald klikken geen
nieuwe jobs toevoegt.

### Verplichte mocktests

Test minimaal:

- burst van meerdere gebruikers;
- strikte serialisatie en minimale tijd tussen requests;
- FIFO-volgorde;
- één pending job per UID;
- 10-seconden-cooldown;
- timeout en doorgaan met de volgende job;
- upstream 4xx/5xx/rate-limitgedrag;
- queueherstel na re-instantiatie;
- ontbrekende serverconfiguratie fail-closed;
- geen codepad dat rechtstreeks om de queue heen de provider kan aanroepen.

CI en normale lokale tests mogen hiervoor nooit de echte provider benaderen.

Leidend implementatiebestand voor Codex:
`docs/codex/02-moxfield-queue.md`.

---

## Feature 3 — Moxfield provider aansluiten

**Afhankelijk van:** Feature 2.

**Voorgestelde branch:** `feature/moxfield-provider`

Sluit Moxfield pas aan nadat de mockqueue aantoonbaar alle upstreamcalls
serialiseert. De provider levert uitsluitend het bestaande provider-neutrale
`ImportedDeck`-contract op.

### Security-invarianten

- de verstrekte toegangsinformatie is een **server-side credential** en wordt als
  wachtwoord behandeld;
- de credential bereikt nooit browser, runtime-config, HTML, clientbundle,
  sourcemap, error payload of logging;
- runtimegebruik gebeurt vanuit de Import Worker via een Cloudflare Worker
  Secret of gelijkwaardige server-side secret store;
- wanneer GitHub Actions wordt gebruikt om dat secret te provisionen, mag de
  waarde uitsluitend uit een GitHub **Secret** komen, nooit uit Repository
  Variables of committed configuratie, en de workflow mag de waarde niet loggen;
- alle echte providercalls lopen via de Feature-2 queue;
- import en update van deze provider blijven gratis beschikbaar voor gebruikers
  conform de projectspecifieke toestemming;
- de niet-publieke/unsupported upstreaminterface wordt defensief gevalideerd en
  mag zonder compatibiliteitsgarantie wijzigen.

Bij een mislukte Update blijft het laatst opgeslagen deck bruikbaar en wordt het
niet door een gedeeltelijke of ongeldige response overschreven.

### Testgrens

Contract-, parser-, queue- en fouttests gebruiken private/synthetische fixtures
of mocks die geen vertrouwelijke credential bevatten. Publieke tests mogen geen
raw niet-openbare providerresponse publiceren wanneer dat onnodige technische
reconstructie mogelijk maakt.

Leidend implementatiebestand voor Codex:
`docs/codex/03-moxfield-provider.md`.

---

## Feature 4 — ManaBox via private repository/package

**Afhankelijk van:** Feature 1. Bij voorkeur na Feature 3 zodat de generieke
providerflow al bewezen is.

**Voorgestelde branch:** `feature/manabox-private-provider-boundary`

ManaBox heeft gevraagd dat de niet-openbare endpoint- en implementatiekennis niet
in de open-sourceimplementatie terechtkomt. De volledige provideradapter hoort
daarom in een aparte private repository/package en wordt uitsluitend server-side
gebruikt.

De private component bevat onder andere de niet-openbare upstreamkennis,
requestconstructie, runtimevalidatie, mapping en private fixtures. Deze publieke
repository bevat alleen eigen provider-neutrale interfaces en capability/UI-logica.

### Open-source fork-invariant

De publieke repository mag **niet afhankelijk worden van toegang tot het private
package om normaal te kunnen installeren of testen**. Een willekeurige fork moet
zonder private token kunnen uitvoeren:

```sh
npm ci
npm run lint
npm run type-check
npm test
npm run build
```

Daarom wordt het private package niet als verplichte normale dependency in de
publieke lockfile opgenomen. De publieke build heeft een veilige
“provider unavailable”-implementatie/capability. Alleen een trusted officiële
release mag de private server-side adapter injecteren of koppelen.

Een fork krijgt daarmee wel de open-source providercontracten, maar niet:

- private broncode;
- private package-registrycredentials;
- ManaBox-upstreamdetails;
- private fixtures/captures;
- projectspecifieke providerrechten.

De UI moet een provider die in een deployment niet beschikbaar is verbergen of
netjes als niet beschikbaar behandelen; nooit proberen terug te vallen op een
client-side reconstructie.

### Packaging-eis

De concrete trusted-buildstrategie wordt in Feature 4 gekozen nadat de huidige
GitHub Actions-releaseflow is geïnspecteerd. Toegestane oplossingen moeten aan
alle volgende eisen voldoen:

- geen private dependency vereist voor PR-CI of forks;
- private code alleen in de server-side Workerbundle van de officiële deployment;
- geen private source maps/artifacts openbaar publiceren;
- geen providerinternals via logs of errors;
- private package-token alleen in trusted releasecontext;
- publieke repository blijft volledig bruikbaar met ManaBox uitgeschakeld.

De daadwerkelijke private ManaBox-adapter en zijn technische documentatie horen
**niet** in deze repository. Een Codex-prompt voor die implementatie hoort in de
private repository zelf.

Leidend publiek implementatiebestand voor Codex:
`docs/codex/04-manabox-private-provider.md`.

---

## Volgorde

Voer de features uit als vier afzonderlijke pull requests:

```text
1. Deck Library + wizard + explicit Update
                ↓
2. Moxfield FIFO/rate-limit infrastructuur met mocks
                ↓
3. Moxfield provider via de bewezen queue
                ↓
4. ManaBox private-packagegrens + trusted integration
```

Begin niet alvast aan een volgende provider terwijl de Definition of Done van de
huidige feature nog niet is gehaald. Dat houdt securityreviews, rollback en
providerafspraken controleerbaar.
