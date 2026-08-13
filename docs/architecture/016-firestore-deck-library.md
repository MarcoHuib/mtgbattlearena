# ADR 016 — Firestore Deck Library en verdeling van platformload

## Status

Accepted en geïmplementeerd — 13 augustus 2026.

## Context

MTG Battle Arena gebruikt Firebase al voor Authentication en Hosting en gebruikt
Cloudflare Workers/Durable Objects voor providerintegraties, lobbycoördinatie en
authoritative online games.

De nieuwe Deck Library introduceert duurzame gebruikersdata die een ander
levenspatroon heeft dan realtime gamestate:

- een deck blijft bestaan tussen sessies en games;
- de `/decks`-pagina leest vooral kleine metadatarecords;
- volledige deckinhoud is pas nodig bij openen, offlinegebruik of game-start;
- providerimports en updates blijven server-side gecontroleerde operaties;
- online games moeten na start niet afhankelijk blijven van Firestore of een
  externe provider.

Alles in Cloudflare opslaan zou de bestaande Cloudflarelaag onnodig ook tot
algemene gebruikersdatabase maken. Alles in Firebase uitvoeren zou juist de
providerqueue, rate limiting en realtime gamecoördinatie verzwakken. De
verantwoordelijkheden worden daarom bewust verdeeld.

## Besluit

### Verantwoordelijkheden

```text
Firebase Authentication
  └── identiteit / uid

Cloud Firestore
  └── duurzame Deck Library per uid
      ├── kleine deckmetadata
      └── huidige provider-neutrale decksnapshot

Cloudflare Game Worker
  ├── application-API
  ├── auth + App Check
  ├── authoritatieve Create / Update / Delete
  └── deckselectie voor online game-start

Cloudflare Import Worker
  └── provideradapters en normalisatie
      ├── Archidekt
      ├── Moxfield via queue
      └── optionele private provideradapter

Cloudflare Durable Objects
  ├── Moxfield FIFO/coördinatie
  ├── Lobby state
  └── actieve Game state

IndexedDB
  └── lokale/offline cache en offlinegame-data; niet de cloud source of truth
```

Firestore wordt daarmee de **duurzame source of truth voor de cloud Deck
Library**. Durable Objects blijven de source of truth voor hun eigen realtime of
gecoördineerde processen. Er wordt geen tweede permanente kopie van dezelfde
Deck Library in D1 of een Durable Object bijgehouden.

### Firestore-datamodel

Gebruik een kleine metadatarecord los van de volledige huidige deckinhoud. Een
conceptueel model is:

```text
users/{uid}/decks/{deckKey}
  provider
  externalDeckKey
  sourceUrl
  name
  format
  commanderSummary
  thumbnailImageRef
  colorIdentity[]
  cardCount
  createdAt
  updatedAt

users/{uid}/decks/{deckKey}/content/current
  cards[]
  definitions[]
  importedAt
```

`thumbnailImageRef` en `colorIdentity` worden als native Firestore map- en
arrayvelden opgeslagen. De browseradapter normaliseert deze velden runtime en
blijft leescompatibel met de kortstondig gebruikte JSON-tekstvelden. Een
ongeldige legacy-thumbnail wordt genegeerd en mag geen library- of
offline-scherm laten crashen.

De exacte veldnamen worden tijdens Feature 1 afgestemd op het bestaande
provider-neutrale domeincontract. Providerresponses zelf worden niet in
Firestore opgeslagen. `thumbnailImageRef` is één genormaliseerde
kaartafbeeldingsreferentie en `colorIdentity` bevat uitsluitend
provider-neutrale W/U/B/R/G-codes. Zo rendert de library een compacte visuele
kaart zonder de volledige deckinhoud te lezen. Bestaande records zonder deze
optionele velden behouden een fallback en krijgen de presentatiemetadata bij een
bewuste Update.

De scheiding is bewust: de Deck Library kan metadata tonen zonder bij iedere
lijstweergave alle kaarten en definitions te downloaden. Firestoredocumenten
hebben daarnaast een maximale documentgrootte; grote provider-neutrale snapshots
horen daarom niet in hetzelfde document als de lijstmetadata wanneer dat
onnodige reads of groeirisico veroorzaakt.

### Deckidentiteit zonder `sourceHash`

`sourceHash` wordt niet gebruikt voor identiteit, duplicate-detectie, freshness
of updatebeslissingen.

De stabiele identiteit is:

```text
uid + provider + externalDeckKey
```

Binnen `users/{uid}/decks` wordt bij voorkeur een deterministische en
Firestore-veilige `deckKey` afgeleid uit `provider + externalDeckKey`, bijvoorbeeld
via een reversibele veilige encoding. Dit is **geen contentfingerprint** en
vereist geen extra providerrequest of frontendberekening.

Daardoor kan dezelfde owner dezelfde externe bron niet tweemaal aanmaken, ook
niet bij twee vrijwel gelijktijdige requests. Een tweede Create retourneert
`DECK_ALREADY_IMPORTED` en verwijst naar **Update**.

### CRUD-semantiek

De Deck Library gebruikt expliciete CRUD-semantiek:

- **Create / Import:** controleer duplicate-identiteit, haal providerdata op,
  valideer/normaliseer en schrijf metadata + huidige snapshot;
- **Read:** lijstmetadata mag rechtstreeks uit Firestore worden gelezen onder
  Firebase Authentication, Security Rules en App Check; volledige content wordt
  alleen geladen waar nodig;
- **Update:** alleen na bewuste gebruikersactie opnieuw de provider benaderen;
  bij succes huidige snapshot + metadata atomair vervangen;
- **Delete:** metadata en huidige snapshot samen verwijderen; historische of
  reeds gestarte games behouden hun eigen vastgelegde snapshot.

Er is geen automatische providerpolling en geen inhoudshashvergelijking om te
beslissen of Update nodig is.

### Server-authoritative writes

Create, Update en Delete lopen via de beschermde application-API en worden niet
als vrije Firestore-writes aan de browser aangeboden. De server valideert de
Firebase-UID en accepteert nooit een willekeurig Firestore-pad van de client.

De concrete Firestore serveradapter wordt tijdens Feature 1 geïmplementeerd met
een officieel ondersteunde REST/IAM-route of gelijkwaardige veilige serverroute.
Wanneer daarvoor een service-accountcredential nodig is, staat die uitsluitend
in een server-side secret store en nooit in frontendcode, runtime-config, de
repository, logs of publieke build-artifacts.

Omdat IAM-geauthenticeerde servertoegang Firestore Security Rules kan omzeilen,
moet servercode tenant-isolatie zelf afdwingen: ieder pad wordt opgebouwd uit de
door MTG Battle Arena geverifieerde `uid`, niet uit een user-controlled owner-ID.

De implementatie gebruikt Firestore REST `documents:commit`. De Game Worker
maakt kortlevende OAuth-access tokens met een service-account dat uitsluitend via
het Worker Secret `FIRESTORE_SERVICE_ACCOUNT_JSON` wordt aangeleverd. Create
gebruikt `exists: false` voor race-safe duplicate-detectie; Update en Delete
verwerken metadata en `content/current` in één atomische commit.

### Directe reads en loadverdeling

De webapp mag owner-scoped Deck Library-reads rechtstreeks uit Firestore doen.
Dit verdeelt gewone bibliotheekreads over Firebase in plaats van iedere listing
via Cloudflare te proxyen. Security Rules staan alleen reads toe voor de eigen
`uid`; App Check wordt voor de Firestore Web App geconfigureerd voordat deze
route production-ready is.

Cloudflare blijft verantwoordelijk voor het zwaardere en veiligheidskritische
werk: providerrequests, normalisatie, queueing, mutations en realtime gameplay.
Dit is een bewuste verdeling van verantwoordelijkheid én load, geen duplicatie
van dezelfde state over twee databases.

### Online game-start

De client stuurt bij online game-start alleen de gekozen library-`deckKey`.
De server controleert ownership en leest de huidige genormaliseerde snapshot uit
Firestore voordat de game wordt geïnitialiseerd. De Game Durable Object krijgt
daarna zijn eigen immutable/startsnapshot voor die game.

Na game-start is Firestore niet nodig voor normale gameplay. Een latere **Update**
van het librarydeck verandert een reeds lopende game niet.

### Offline

Offline spelen zonder Firebase/Cloudflare blijft mogelijk. IndexedDB mag een
lokale kopie/cache van clouddecks bevatten, maar die kopie is niet de cloud source
of truth. Offline-only decks of savegames blijven onder de local-firstgrenzen uit
ADR 001 vallen.

De offline setup toont dezelfde owner-scoped Deck Library-keuzes als de online
lobby wanneer de gebruiker met een niet-anoniem account is aangemeld. Bij selectie leest de browser de
authoritative huidige content onder Firestore Rules en legt daarvan eerst een
immutable `DeckSnapshot` vast in IndexedDB. De lokale battle start uitsluitend
met die snapshot en blijft daarna zonder Firebase beschikbaar. Reeds lokale
snapshots blijven selecteerbaar. Uitgelogde en Firebase-anonieme gebruikers
importeren via dezelfde providerwizard naar uitsluitend IndexedDB; die flow doet
geen Firebase-write. De wizard houdt toekomstige providers zichtbaar als
onbeschikbare capability zonder ze vooruitlopend te implementeren.

## Security-invarianten

- Firestoredocumenten zijn owner-scoped op de geverifieerde Firebase-UID.
- Clientreads zijn uitsluitend voor de eigen library.
- Clientwrites naar authoritative clouddeckrecords zijn standaard niet toegestaan.
- Serverwrites construeren paden zelf uit de geverifieerde UID.
- Firestore/servercredentials zijn secrets en komen nooit in browser of repo.
- Providercredentials of private providerdetails worden niet in Firestore
  opgeslagen.
- Raw providerresponses worden niet als persistente librarydata bewaard.
- Online game-start accepteert geen door de client aangeleverde deckinhoud als
  authoritative snapshot.
- Geen D1/DO-schaduwkopie van de volledige Deck Library.

## Gevolgen

Voordelen:

- duurzame user-owned decks passen bij een documentdatabase;
- bibliotheekreads belasten niet onnodig de Cloudflare application-API;
- Cloudflare blijft gericht op provider/security/realtime workloads;
- actieve games blijven onafhankelijk van Firebasebeschikbaarheid na start;
- geen contentfingerprints of client-side freshnesscalls meer nodig;
- duidelijke source-of-truthgrenzen verminderen synchronisatiecomplexiteit.

Nadelen:

- er komt een nieuwe Firestore persistenceadapter en Security Rules-configuratie;
- server-side Firestoretoegang vereist zorgvuldige auth/IAM- en secretkeuzes;
- metadata en content zijn twee records die bij mutations consistent moeten
  blijven;
- lokale/offline data en cloudlibrary blijven twee expliciete scopes die de UI
  goed moet onderscheiden.

## Referenties

- Firebase: Cloud Firestore REST API — Firebase ID-tokenrequests worden door
  Firestore Security Rules beoordeeld; IAM/servercredentials hebben een andere
  trustgrens.
- Firebase: Firestore Security Rules + Authentication voor owner-scoped access.
- Firebase: Firestore usage/limits, waaronder de documentgroottegrens.
- Cloudflare: Durable Objects blijven bedoeld voor stateful coördinatie en
  realtime/distributed state, niet als duplicaat van de user Deck Library.

Zie ook:

- [ADR 001](./001-local-first-boundaries.md)
- [ADR 006](./006-online-multiplayer.md)
- [ADR 010](./010-provider-agnostic-deck-import.md)
- [ADR 013](./013-deck-library-and-explicit-refresh.md)
- [ADR 014](./014-moxfield-queued-imports.md)
