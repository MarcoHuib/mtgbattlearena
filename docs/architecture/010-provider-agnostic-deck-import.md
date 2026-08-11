# ADR 010 — Provider-onafhankelijke deckimport

## Besluit

Deckimport volgt voortaan deze grens:

```text
provider-URL
→ providerselectie en veilige ID-extractie
→ provider-API met vaste upstreamhost
→ Zod-validatie en provider-mapper
→ MTG Battle Arena ImportedDeck
→ gesloten GraphQL persisted operation
→ gedeelde deckinterpretatie
→ offline game / authoritative online game
```

`ImportedDeck` is eigendom van MTG Battle Arena. Het bevat bronidentiteit en
fingerprint, kaartdefinities, aantallen, commanderstatus, kaartzijden,
afbeeldingsreferenties en tokens die het spel werkelijk gebruikt. Raw
Archidekt-objecten, `cardPackage`, categories en providerresponses verlaten de
Archidekt-adapter niet. Het DTO is nadrukkelijk geen `GameState`: runtime-ID's,
zones, shuffle, spelers en counters ontstaan pas tijdens game setup.

## Sources, revisions en gebruikerskeuze

De globale Lobby Durable Object bewaart twee duurzame SQLite-relaties. De tabel
`deck_source_identities` geeft iedere unieke `(provider, external_id)` één door
MTG Battle Arena gegenereerd source-ID. `deck_revisions` bewaart vervolgens een
onveranderlijke import per `(deck_id, source_hash)`, inclusief het gevalideerde
provider-neutrale deck-JSON. Zowel source- als revision-ID zijn UUID's. Cache-
evictie heeft daardoor geen invloed op identiteit of historische revisions.

De begrippen zijn bewust gescheiden:

- `DeckSource`: de stabiele providerbron `(provider, externalId)` en zijn interne
  `deckId`;
- `DeckRevision`: één onveranderlijke MTG Battle Arena-weergave van een
  `sourceHash`, geïdentificeerd door `revisionId`;
- `UserDeck`: de lokale ownerkoppeling die per `(ownerId, deckSourceId)` precies
  één gekozen `revisionId` aanwijst;
- `GameDeckSnapshot`: de volledige kaarten en definities die bij gamestart uit
  die revision naar `GameState` worden gekopieerd en daarna niet wijzigen.

GraphQL retourneert zowel `deckId` als `revisionId` naast `ImportedDeck`. Een
herhaalde import met dezelfde hash hergebruikt de revision; een nieuwe hash maakt
een nieuwe revision zonder de oude rij te muteren. Omdat userdeck-ownership nu
alleen lokaal bestaat, blijft de keuze in IndexedDB. Een expliciete herimport
vervangt alleen de ownerkoppeling van de gebruiker die importeert; andere owners
blijven hun eerdere revision zien.

IndexedDB-versie 5 behandelt bestaande deckrecords als initiële revisions.
Versie 6 maakt de ownerrelatie expliciet als
`(ownerId, deckSourceId) -> revisionId` en herstelt eventuele oudere dubbele
owner/source-rijen idempotent. Wanneer oude duplicaten verschillende
`sourceHash`-waarden hebben, blijven het afzonderlijke revisionrecords; alleen
de zichtbare ownerselectie wordt teruggebracht tot één revision. Bij meerdere
selecties voor dezelfde owner/source wint de recentste `importedAt`. Bestaande
games en offlinepakketten worden niet herschreven of verwijderd.

Een toekomstige provider of SYSTEM/demo-bron gebruikt dezelfde source- en
revisionregels met een eigen providerwaarde. Daardoor kunnen ook demo-gebruikers
op een oudere revision blijven terwijl nieuwe gebruikers de nieuwste kiezen;
demo-decks zelf vallen buiten deze wijziging.

## Provider- en securitygrens

De Archidekt-provider herkent uitsluitend `https` op `archidekt.com` en
`www.archidekt.com`, zonder credentials of afwijkende poort, en accepteert alleen
het bekende deckpad met positief numeriek ID. Uitgaand verkeer gebruikt vaste
API-constants en volgt geen redirects; de gebruikers-URL wordt nooit gefetcht.
Responses hebben timeout- en groottelimieten en worden vóór mapping met Zod
gevalideerd. Imagebytes blijven via de bestaande, nauw begrensde HTTP-proxy gaan.

De GraphQL-query `deckFromUrl` gebruikt de bestaande App Check-, CORS-,
requestlimit-, foutmaskerings- en persisted-operationketen. Deckimport blijft,
zoals voor de migratie, zonder verplichte Firebase-login beschikbaar; App Check
blijft vereist volgens de ingestelde enforcementmodus.

## Fingerprint en cache

`@mtg/deck-source` berekent aan beide kanten SHA-256 over dezelfde canonieke
Archidekt-bronrepresentatie. Objectkeys en collecties worden stabiel gesorteerd;
bekende providerstatistieken en timestamps worden genegeerd. Aantallen,
commander-categorieën, kaartdata, zijden en tokens beïnvloeden de hash wel. Deze
module bevat bewust geen mapping naar `ImportedDeck` of gameplay.

Bij een normale import observeert de browser de actuele deck- en tokenresponses
via de bestaande vaste, met App Check beveiligde importproxy. Rechtstreeks
Archidekt benaderen is niet nodig en de browser krijgt geen generieke fetchproxy.
De browser stuurt de gedeelde fingerprint als `sourceHash` naar `deckFromUrl`.

De cache bevat uitsluitend het gevalideerde `ImportedDeck`, nooit raw provider-
JSON. Zonder cache wordt de provider opgehaald (`MISS`). Zonder clienthash of met
een match wordt de bekende DTO zonder providercall geretourneerd (`HIT`). Een
mismatch is alleen een stale-hint: de backend haalt en valideert opnieuw en
berekent met dezelfde module zelf de vervangende bronhash (`REFRESHED`). De frontendhash is nooit
autoritatief. Een mislukte of ongeldige refresh overschrijft de geldige cache
niet en levert een zichtbare importfout op.

De DTO-cache gebruikt een publieke HTTPS-cachekey onder
`api.mtgbattlearena.nl/__internal-cache/imported-deck/v2/...`. De `v2` voorkomt
dat oudere raw Archidekt-cachewaarden als `ImportedDeck` worden gelezen; iedere
cachewaarde wordt bovendien structureel gecontroleerd. Een ongeldige of tijdelijk
onbereikbare cache wordt gelogd en als miss behandeld, zodat caching nooit een
autoritatieve import blokkeert. De publieke GraphQL-fout blijft gemaskeerd;
Workerlogs bevatten alleen fase, interne foutcode, provider, source-ID en release.

De publieke freshness-route en de autoritatieve import gebruiken dezelfde
allowlisted Archidekt HTTP-client. Deze client bouwt absolute API-URL's, gebruikt
GET met dezelfde headers, timeout en 5 MB-limiet, en verwerkt redirects handmatig.
Alleen HTTPS-redirects naar `archidekt.com` of `www.archidekt.com` en een `/api/`
pad worden gevolgd. Daarmee kan een normale Archidekt-redirect de interne import
niet breken zonder de SSRF-grens te verzwakken.

## Offline/online-pariteit

Na import bewaart IndexedDB een onveranderlijke `DeckSnapshot`; offline spelen
heeft daarna GraphQL noch Archidekt nodig. De provider-onafhankelijke omzetting
naar het online registratiecontract staat in `@mtg/game-protocol`. Zowel offline
als online runtime-setup gebruikt vervolgens `game-core/createGameForPlayers`
voor aantallen, commanderzones, instanties, kaartzijden, tokens en openingshand.

Online voegt uitsluitend identiteit, autorisatie, server-ID's, Durable Object-
opslag, serverrandomness, private views en WebSockets toe. Offline houdt lokale
persistence, lokale spelersconfiguratie en lokale lifecycle. Die verschillen
veranderen de decksemantiek niet.

## Nieuwe provider

Moxfield toevoegen vereist een URL-recognizer, vaste API-client,
response-schema, canonieke provider-mapping en tests onder een nieuwe provider-
module. Die mapper levert hetzelfde `ImportedDeck`. De frontend GraphQL-query,
Redux/gameplay, offline setup, online setup en WebSocketprotocol hoeven daarvoor
niet te veranderen; alleen de uitbreidbare `DeckSource`-enum krijgt een waarde.
