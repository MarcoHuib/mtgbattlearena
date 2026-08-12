# 009 — GraphQL application API met RTK Query

## Besluit

De online application/server-data-API gebruikt `POST /graphql` in de bestaande
Game Worker. GraphQL Yoga draait naast enkele bestaande HTTP-compatibiliteits-
routes; de first-party webapp gebruikt gegenereerde persisted GraphQL-operaties
voor lobby- en deckimportdata. De realtime gameverbinding blijft bewust
WebSocket-gebaseerd.

De browser gebruikt gegenereerde RTK Query-endpoints in de bestaande Redux
Toolkit-store. Apollo Client is bewust niet toegevoegd: een tweede genormaliseerde
cache naast Redux zou remote-state-eigenaarschap onduidelijk maken. Redux-slices
blijven eigenaar van lokale game-, offline- en UI-state; RTK Query beheert
GraphQL-requeststatus en servercache.

## Migratiemapping

| REST-operatie                        | GraphQL                                                                                      | Hergebruikte backendfunctie                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `GET /api/online/lobbies`            | `publicLobbies`                                                                              | `LobbyDurableObject.listPublicLobbies`                   |
| `POST /api/online/lobbies`           | `createLobby`                                                                                | `LobbyDurableObject.createLobby`                         |
| `POST /api/online/lobbies/join`      | `joinLobby`                                                                                  | `LobbyDurableObject.joinByCode`                          |
| `GET /api/online/lobbies/:id`        | `lobby`                                                                                      | `LobbyDurableObject.getLobbyRoom`                        |
| `DELETE /api/online/lobbies/:id`     | `deleteLobby`                                                                                | `LobbyDurableObject.deleteLobby`                         |
| `PUT /api/online/lobbies/:id/deck`   | `registerDeck`                                                                               | `LobbyDurableObject.registerDeck` + bestaand Zod-schema  |
| `POST /api/online/lobbies/:id/start` | `startGame`                                                                                  | bestaande prepare/init/mark/release-flow                 |
| `POST /api/online/lobbies/:id/abort` | `abortGame`                                                                                  | bestaande hostsession, Game DO en lobbystatus            |
| `POST /api/online/socket-ticket`     | `createSocketTicket`                                                                         | `LobbyDurableObject.issueSocketTicket`                   |
| `GET /api/online/games/:id/snapshot` | GraphQL-resolver bestaat voor migratie/tests maar is niet als first-party productieoperatie geregistreerd | session lookup + `GameDurableObject.getPersonalSnapshot` |
| provider-deckimport                    | `deckFromUrl(url, sourceHash)`                                                               | private Import Worker + `LobbyDurableObject.resolveDeckRevision`             |

`GET /api/online/health`, `POST /api/online/games/:id/commands` en de
WebSocket-upgrade blijven HTTP. De commandroute is een bestaande fallback;
normaal realtime verkeer blijft via WebSockets lopen. De webapp importeert decks
via GraphQL `deckFromUrl`; een begrensde Archidekt freshness-proxy blijft alleen
voor bronfingerprinting/compatibiliteit bestaan. Card images zijn volledig uit
de application-API gehaald en lopen via de aparte publieke Image Worker/CDN uit
ADR 011.

## Securitygrenzen

- Firebase ID-tokens en App Check gebruiken dezelfde bestaande verifiers en
  enforcementmodus als REST.
- Resolvers vertrouwen nooit een client-UID en delegeren autorisatie aan de
  bestaande Durable Objects.
- `personalGameSnapshot` retourneert uitsluitend de bestaande persoonlijke view.
  Authoritative state bereikt GraphQL niet; verborgen handen en libraries van
  andere spelers blijven buiten de transportlaag.
- Alleen `POST` met `application/json` is toegestaan. Requestgrootte, diepte,
  veldental en aliassen zijn begrensd; batching en subscriptions zijn geblokkeerd.
- De bestaande exacte CORS-originallowlist blijft leidend; Yoga voert geen tweede
  CORS-beleid.
- Productiefouten worden gemaskeerd. Productie-introspection is uitgeschakeld.
- `graphql:codegen` parseert iedere benoemde first-party operatie, print een
  canoniek document en genereert deterministische SHA-256-registers voor Worker
  en browser. Productie en staging accepteren uitsluitend een bekende hash en
  lossen het document server-side uit dit register op. Een meegestuurd document,
  onbekende hash, naam/hash-mismatch of APQ-achtige dynamische registratie faalt
  gesloten. `GRAPHQL_ALLOWED_OPERATIONS` bestaat niet meer.
- Development en test mogen normale GraphQL-documenten sturen. Een eventueel
  bekende persisted hash wordt ook daar uit hetzelfde register opgelost.
- Mutatiequota/rate-limits blijven in de Durable Objects. Algemene edge-rate-
  limiting blijft deploymentconfiguratie en is geen resolverlogica.

## Frontend, realtime en offline

Operaties staan in `apps/web/src/app/api/operations.graphql`. Code generation
maakt schema- en operationtypes, RTK Query-endpoints, React-hooks en beide
persisted-operationregisters. De lobbylist en lobbyroom gebruiken de gegenereerde
hooks rechtstreeks, inclusief loading/error, polling, focus-refetch en cachetags.
De bestaande service-interface blijft voor mocks, Auth/health, imperatieve
lobbymutaties en het maken van WebSocketverbindingen/tickets.

De selecties zijn use-casegericht: de lijst vraagt geen `createdAt`; de lobbyroom
vraagt geen `id`, `format`, `visibility`, `playerCount` of `createdAt`; create en
join retourneren alleen navigatiegegevens. `startGame` retourneert alleen succes,
en het socket-ticket vraagt alleen het werkelijk gebruikte ticket op, niet de
vervaltijd. `startGame` retourneert niet langer de volledige persoonlijke
snapshot. De volledige gameview komt via
de authoritative WebSocket. De GraphQL `personalGameSnapshot`-resolver blijft
achter de bestaande persoonlijke DO-viewgrens voor migratie/tests, maar staat niet
in het productie-persisted-operationregister omdat er geen frontendconsumer is.

WebSocketevents muteren geen gamecache in RTK Query. De eerste persoonlijke
snapshot (game gestart/reconnect zonder eerdere view) invalideert lobbylijst en
lobbyroom; `GAME_ABORTED` doet hetzelfde. Latere persoonlijke snapshots,
`COMMAND_ACCEPTED` en errors met snapshots horen exclusief bij de online Redux-
WebSocketstate en raken RTK Query niet.

GraphQL subscriptions zijn niet beschikbaar. Socket-ticketconsumptie,
WebSocket-upgrade, commandvalidatie, berichtlimieten en broadcasts zijn
ongewijzigd. Offline routes, IndexedDB, autosave en assetcaching zijn niet afhankelijk gemaakt
van GraphQL of Firebase. De online/managed deckimport gebruikt wel GraphQL als
application-API, terwijl de provideradapter en Image Worker afzonderlijke
architectuurgrenzen blijven.
