# ADR 011 — Card-image delivery boundary

Archidekt is uitsluitend een deck/importbron. De adapter zet de expliciete
Scryfall printing-ID om naar MTG Battle Arena's provider-neutrale `ImageRef`:

```ts
type ImageRef = { resolver: number; imageId: string; faceIndex: number; variant: "normal" }
```

Resolver `1` betekent alleen binnen de image Worker Scryfall. Clients bouwen
uitsluitend met de centrale helper URL's naar
`https://cdn.mtgbattlearena.nl/v1/{resolver}/{imageId}/{faceIndex}/{variant}.webp`.
Upstream-URL's maken geen deel uit van ImportedDeck, GraphQL of persoonlijke
online views.

`apps/image-worker` is een publieke, authenticatieloze GET/HEAD CDN-grens. Hij
accepteert alleen v1, resolver 1, UUID printing-ID's, face 0/1 en `normal`, en
construeert zelf een HTTPS-URL op `cards.scryfall.io`. Vreemde redirects,
non-images en te grote of trage responses worden geweigerd. Veilige responses
krijgen immutable publieke cacheheaders en worden in Cloudflare Cache API
gezet; cachefouten zijn niet fataal. Er is geen R2, Firebase, App Check of cookie.

Oude snapshots worden bij hydratatie compatibel gelezen. Alleen hun printing-ID
wordt gebruikt; de oude URL bepaalt nooit identiteit. Een toekomstige
deckprovider die dezelfde Scryfall printing-ID levert hergebruikt resolver 1 en
dezelfde cachekey en vereist dus geen nieuwe resolver.
