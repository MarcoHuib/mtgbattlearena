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

De Worker berekent SHA-256 over een canonieke semantische representatie van
naam/formaat, gesorteerde deckentries en gesorteerde genormaliseerde
kaart-/tokendefinities. Objectkeys zijn stabiel gesorteerd. Providerstatistieken,
viewcounts, responsevolgorde en andere ongebruikte metadata beïnvloeden de hash
niet; aantallen, commanderstatus, kaartidentiteit, zijden en tokens wel.

De cache bevat uitsluitend het gevalideerde `ImportedDeck`, nooit raw provider-
JSON. Zonder cache wordt de provider opgehaald (`MISS`). Zonder clienthash of met
een match wordt de bekende DTO zonder providercall geretourneerd (`HIT`). Een
mismatch is alleen een stale-hint: de backend haalt en valideert opnieuw en
berekent zelf de vervangende hash (`REFRESHED`). De frontendhash is nooit
autoritatief. Een mislukte of ongeldige refresh overschrijft de geldige cache
niet en levert een zichtbare importfout op.

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
