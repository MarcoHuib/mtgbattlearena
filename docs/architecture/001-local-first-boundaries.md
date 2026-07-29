# ADR 001 — Local-first grenzen

## Status

Geaccepteerd en uitgebreid voor fase 2.

## Context

Een lopende battle moet refreshes en netwerkuitval overleven. Tegelijkertijd
moet Redux voorspelbare interactieve state beheren zonder zelf een database of
binaire afbeeldingen te bevatten. Een expliciet offlinepakket mag niet
hetzelfde zijn als een tijdelijke browsercache.

## Besluit

- `packages/game-core/src` bevat platformonafhankelijke modellen en pure
  state-overgangen. Kaartdefinities en fysieke kaartinstanties zijn gescheiden;
  zones bevatten alleen instance-ID's.
- Redux beheert de actieve battle, geschiedenis, setupstatus en zichtbare
  offlinevoortgang. Reducers spreken IndexedDB en Cache API niet aan.
- Multiselect staat in gedeelde, vluchtige UI-state. Kaartposities, tokens,
  counters, actieve kaartzijde, poison, commander tax en commander damage
  staan juist in de duurzame game-state.
- Listener middleware schrijft relevante Redux-acties gedebouncet als
  versieerbare `PersistedGame` naar een `GameRepository`.
- Dexie implementeert repositoryinterfaces voor decks, games,
  offlinepakketmanifesten en assetmetadata. Daardoor blijft een andere
  opslagimplementatie mogelijk.
- Decksnapshots blijven immutable en kunnen door een bestaande savegame worden
  vastgehouden. Een afzonderlijke Dexie-eigenaarsindex bepaalt welke snapshots
  in de decklijst van een Firebase-gebruiker of in de apparaatlokale offlinelijst
  verschijnen. Verwijderen haalt eerst alleen die eigenaarskoppeling weg; data
  die nog door een game of offlinepakket wordt gebruikt blijft behouden.
- Bestaande snapshots uit databaseversie 1 krijgen bij migratie bewust de
  neutrale eigenaar `device`; de oude data bevatte geen betrouwbare Firebase-UID.
  Een ingelogde gebruiker kan zo'n zichtbaar gemarkeerde legacy-import via
  Decks beheren expliciet aan het eigen account koppelen.
- De snapshot-ID bevat een deterministische fingerprint van de geïmporteerde
  Archidekt-inhoud. Dezelfde import maakt daardoor geen duplicaat, terwijl een
  gewijzigde deckinhoud een nieuw immutable snapshot oplevert.
- De PWA-serviceworker bewaart de app-shell en opportunistische
  runtime-afbeeldingen. Dat is vervangbare cache.
- “Download voor offline gebruik” maakt apart een duurzaam manifest en bewaart
  alle unieke kaartzijdes in een benoemde, expliciete Cache API-cache. Voortgang
  en fouten worden per asset in IndexedDB vastgelegd. Alleen gebruikersactie of
  een zichtbare migratie mag dit pakket verwijderen.

## Gevolgen

De app kan zonder netwerk hydrateren en spelen zodra app-shell en expliciete
assets aanwezig zijn. Browseropslag blijft onder beleid van de browser vallen;
de UI meldt daarom eerlijk of de Storage Persistence API toestemming gaf.

Savegames gebruiken vanaf fase 3 schema 5. De hydrator ondersteunt schema 1–4
en vult nieuwe velden veilig aan. De Dexie-tabellen zelf hoefden niet
destructief te wijzigen, omdat het versieerbare savegamerecord als geheel wordt
opgeslagen.
