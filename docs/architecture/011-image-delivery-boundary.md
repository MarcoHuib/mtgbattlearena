# ADR 011 — Card-image delivery and caching boundary

Archidekt is uitsluitend een deck/importbron. De adapter zet de expliciete
Scryfall printing-ID om naar MTG Battle Arena's provider-neutrale `ImageRef`:

```ts
type ImageRef = { resolver: number; imageId: string; faceIndex: number; variant: "normal" }
```

Resolver `1` betekent alleen binnen de image Worker Scryfall. Clients bouwen
uitsluitend met de centrale helper URL's naar
`https://cdn.mtgbattlearena.nl/v1/{resolver}/{imageId}/{faceIndex}/{variant}`.
De route is bewust extensieloos. De gebruikte Scryfall `normal`-representatie
levert JPEG en de Worker retourneert daarom echte JPEG-bytes met `image/jpeg`.
Upstream-URL's maken geen deel uit van ImportedDeck, GraphQL of persoonlijke
online views.

## Cache-eigenaarschap

De productieconfiguratie gebruikt Wrangler Workers Caching. Cloudflare
controleert daardoor zijn edge-cache vóór uitvoering van de Worker. De Worker
gebruikt niet ook `caches.default`; responseheaders zijn de enige cachebesturing.
Staging schakelt Workers Caching uit voor voorspelbaar testen.

Een Scryfall printing-ID is stabiel, maar Scryfalls uitgegeven image-URI's kunnen
een afzonderlijke afbeeldingsversie bevatten. Omdat de huidige importdata geen
provider-onafhankelijke, betrouwbaar gegarandeerde contentversie oplevert, is de
publieke URL niet als eeuwig immutable gemodelleerd. Een succesvolle response is
één dag browser-cachebaar en dertig dagen aan de Cloudflare-edge cachebaar:

```text
Cache-Control: public, max-age=86400
Cloudflare-CDN-Cache-Control: public, max-age=2592000
```

Alle validatie- en upstreamfouten retourneren `no-store`; een tijdelijke fout
kan dus nooit de lange asset-TTL krijgen. Cross-version caching staat uit. Een
nieuwe deploy begint bewust met een lege versiespecifieke cache, zodat wijzigingen
aan resolver-, security- of contentsemantiek onmiddellijk gelden.

## Resolver en security

`apps/image-worker` accepteert alleen GET/HEAD, v1, resolver 1, UUID printing-ID's,
face 0/1 en variant `normal`. Resolver 1 construeert uit die identiteit uitsluitend
`https://cards.scryfall.io/normal/{front|back}/{prefix}/{uuid}.jpg`; er is geen
Archidekt-URL-rewrite en geen metadatarequest per afbeelding. Protocol, host,
credentials en poort worden opnieuw gecontroleerd. Upstream redirects worden
met `redirect: "manual"` maximaal drie hops gevolgd; vóór iedere hop wordt
opnieuw HTTPS + exact `cards.scryfall.io` + geen credentials/custom port
gevalideerd. Externe of ongeldige redirects worden geweigerd. Non-JPEG-responses,
te grote responses en timeouts worden eveneens geweigerd. De productiehandler
injecteert geen kale native `fetch` als objectmethode: een gewone wrapper roept
de globale Cloudflare `fetch(input, init)` aan zodat de runtime-`this` binding
behouden blijft en `Illegal invocation` wordt voorkomen. Er is geen R2,
Cloudflare Images, Firebase, App Check of cookie.

Oude snapshots worden bij hydratatie compatibel gelezen. De gedeelde
normalizer gebruikt eerst een geldige huidige referentie, daarna de expliciete
printing-ID en ten slotte een strikt gevalideerde legacy
`{printingUuid}:{faceIndex}:{variant}`-assetkey. De oude URL wordt genegeerd en
bepaalt nooit identiteit. Authoritative online states ouder dan schema 6 worden
eenmalig genormaliseerd; IndexedDB-deckrevisies worden zonder rewrite of nieuw
revision-ID bij read genormaliseerd. Een toekomstige
deckprovider die dezelfde Scryfall printing-ID levert hergebruikt resolver 1 en
dezelfde cachekey en vereist dus geen nieuwe resolver.

## Productie-smoketest

Gebruik na deployment een bekende geldige URL, bijvoorbeeld:

```sh
curl -sS -D - -o /dev/null \
  https://cdn.mtgbattlearena.nl/v1/1/6a9c39e4-a8cf-42dd-8d0e-45634b335546/0/normal
```

Voer dit tweemaal uit vanuit dezelfde regio. De eerste response hoort
`CF-Cache-Status: MISS` (of een reeds warme status) te tonen; de tweede hoort
`CF-Cache-Status: HIT` en dezelfde JPEG/cachemetadata te tonen. Controleer in
Workers-observability dat de tweede HIT geen resolveruitvoering veroorzaakt.
Herhaal met een ongeldige UUID, resolver 2 en variant `large`: die responses
moeten non-success en `no-store` zijn. Bij upstreamproblemen kunnen veilige
Worker-diagnostics status/host/path, redirect host/path en exceptionnaam/-melding
loggen; querystrings, credentials en payloads worden niet gelogd. Een tijdelijke
upstreamfout verifieer je in staging of een gecontroleerde testdeployment; hij
mag nooit een latere geldige response maskeren of een lange cacheheader krijgen.
