# ADR 001 — Local-first grenzen

## Status

Geaccepteerd en door latere ADR’s uitgebreid. De actuele savegameversie is schema 7; deckidentiteit volgt ADR 010 en image delivery ADR 011.

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
- Deckinhoud blijft immutable per revision en kan door een bestaande savegame
  worden vastgehouden. Een stabiele `DeckSource` identificeert `(provider,
  externalId)`; iedere unieke `sourceHash` krijgt een onveranderlijke
  `DeckRevision`. De hash is daarmee versie/freshness en niet langer de
  bronidentiteit zelf.
- De lokale ownerrelatie is expliciet `(ownerId, deckSourceId) -> revisionId`.
  Een herimport kan alleen de selectie van die owner naar een nieuwe revision
  verplaatsen; historische revisions, games en offlinepakketten blijven intact.
- Legacy apparaatlokale snapshots blijven compatibel hydrateerbaar. Migraties
  mogen eigenaarschap of revision-identiteit niet uit providerdata of oude
  afbeelding-URL's afleiden.
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

Offline savegames gebruiken inmiddels schema 7; de hydrator ondersteunt oudere
schema’s en migreert ook history-snapshots veilig door. Deckselecties gebruiken
IndexedDB-versie 6 voor de expliciete owner/source/revision-relatie. De
ImageRef-compatibiliteitslaag uit ADR 011 normaliseert oude deckrevisies bij
hydratie zonder revision-ID of sourceHash te veranderen.
