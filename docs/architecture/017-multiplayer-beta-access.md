# ADR 017 — Multiplayer-bètatoegang via server-side UID-allowlist

## Context

Production (`mtgbattlearena.nl`) en Staging (`beta.mtgbattlearena.nl`) delen één
Firebase-project en dezelfde Firebase Authentication. Online multiplayer moet
tijdens de bèta alleen voor aangewezen Firebase UID's beschikbaar zijn; offline
spelen en de Deck Library blijven voor iedereen werken.

## Analyse

- Lobbies, deelnemers en actieve games staan **niet** in Firestore maar in
  SQLite-backed Durable Objects achter de `game-worker`. Firestore bevat alleen
  de owner-scoped Deck Library; `firestore.rules` weigert al alle andere paden.
  Er is dus geen lobby-Security-Rule om aan te passen.
- Production en Staging zijn aparte Workers (`mtg-battle-mode-online` en
  `…-staging`) met eigen Durable Object-namespaces: lobbydata is gescheiden.
- Alle multiplayerroutes (REST en GraphQL) gaan door `apps/game-worker`, dat
  Firebase ID-tokens zelf verifieert.

## Besluit

Alleen het **aanmaken van lobbies** wordt beperkt. Joinen, de lobbylijst, spelen,
realtime updates en deelname beëindigen blijven open voor elke ingelogde
gebruiker en gebruiken de bestaande controles (lidmaatschap, rol, eigenaarschap,
versie, zone-invarianten) in de Durable Objects.

`apps/game-worker/src/multiplayer-access.ts` is de enige bron van waarheid:
`LOBBY_CREATION_MODE` (`"beta" | "public"`) en `LOBBY_CREATOR_UIDS`.
Autorisatie gebruikt uitsluitend de server-side geverifieerde `uid`.

* Gate: `assertCanCreateLobby` (REST `POST /api/online/lobbies`) en
  `requireLobbyCreatorIdentity` (GraphQL `createLobby`). Niet-allowlisted UID ⇒
  403 `LOBBY_CREATION_RESTRICTED`.
* Alle overige multiplayerroutes vereisen een geldig Firebase-token (de lobbylijst
  is niet langer anoniem leesbaar), maar geen allowlist.
* Fail-closed: geen/ongeldig token, onbekende UID of onbekende modus ⇒ geen
  lobbycreatie.
* Deck Library-operaties zijn niet gated.
* `GET /api/online/access` geeft `{ canCreateLobby, mode }` uitsluitend als
  UX-hint; de server controleert elke create-request apart.
* Geen verschil tussen Production en Staging: de gate kijkt niet naar `APP_ENV`.
  Enige uitzondering is de env-override `LOBBY_CREATION_MODE=public`, die alleen
  buiten gedeployde omgevingen wordt gehonoreerd (voor tests).
* Lobbydata is gescheiden per omgeving (aparte Workers/Durable Object-namespaces).

## Overwogen alternatieven

- **Firebase Custom Claims:** vereist Admin SDK-script, token-refresh voordat
  rechten gelden en een tweede bron naast de Worker. Onnodig complex voor een
  handvol testers.
- **Firestore-allowlistdocument:** extra read per request, Firestore-afhankelijk
  gemaakt voor multiplayer terwijl ADR 016 Firestore tot de Deck Library beperkt.
- **Wrangler `vars`:** worden niet geërfd tussen environments, dus per env
  dubbel te onderhouden en kans op afwijking tussen Production en Staging.

## Beheer

- Extra lobby-host toevoegen: UID toevoegen aan `LOBBY_CREATOR_UIDS`, game-worker
  deployen (Production én Staging via de bestaande release-workflow).
- Publieke release: `LOBBY_CREATION_MODE = "public"`, game-worker deployen.
  Inloggen blijft vereist. Er zijn geen Firestore-rules nodig voor multiplayer.
- Intrekken van een UID geldt direct na de deploy voor nieuwe create-requests.
  Bestaande lobbies van die UID blijven bestaan.
