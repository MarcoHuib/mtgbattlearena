# ADR 002 — Fase-2-spelacties en migratie

## Status

Geaccepteerd. Deze ADR introduceerde savegameschema 4; de actuele offline savegameversie is schema 7.

## Context

Een Commander-playtest heeft meer handmatige administratie nodig, maar MTG
MTG Battle Arena blijft een digitale tafel en geen rules engine. Nieuwe interacties
moeten undo/redo, autosave, refresh en offline herstel overleven zonder
continue pointerbewegingen in Redux te bewaren.

## Besluit

- `game-core/game.ts` blijft de enige plek voor blijvende speltransities.
  `moveCard` verwijdert een instance eerst uit alle zones en voegt hem daarna
  exact eenmaal toe. `moveCards` groepeert meerdere van zulke bewegingen in één
  Redux-geschiedenisactie.
- Fase, poison, commander tax, commander damage, tokenmetadata, actieve
  kaartzijde, counters en genormaliseerde battlefieldpositie horen bij
  `GameState`.
- Selectie, hover, menucoördinaten en de actuele pointerpositie zijn vluchtige
  UI-state. Tijdens slepen volgt geen Redux-dispatch; alleen de definitieve drop
  wordt vastgelegd.
- De drag-feedback animeert na een geldige drop niet terug naar de oude DOM-
  placeholder. Redux rendert de kaart direct in de doelzone of op de nieuwe
  genormaliseerde battlefieldpositie; hoverzoom wordt pas na een volgende
  pointerbeweging weer toegestaan. Zo is er maar één zichtbare eindpositie.
- De begrenzing aan de battlefieldrand gebruikt voor beide assen de halve korte
  kaartzijde. Een rotatie van 90° verandert daardoor niet welke x/y-positie is
  toegestaan en rechte en getapte kaarten kunnen aan de rand op één rij staan.
- Tokens zijn gewone stabiele kaartinstanties met een lokale kaartdefinitie.
  Daardoor werken zones, counters, positionering, undo/redo en persistence
  zonder een tweede tokensysteem. Een ontbrekende afbeelding is een ondersteund
  weergavepad.
- Commander tax wordt per eigen commander-instance bijgehouden. Ontvangen
  commander damage wordt per speler en per vijandige commander-instance
  opgeslagen. Partner en Background hebben daardoor vanzelf afzonderlijke
  tellers.
- Savegame schema 4 migreert schema 1–3 tijdens hydratatie. De migratie voegt
  beginfase, poison en commanderrecords toe en laat bestaande zones, kaarten en
  geschiedenis intact.

## Gevolgen

Alle nieuwe blijvende acties delen dezelfde Redux-history en
listener-middleware voor autosave. Offlinepakketten hoeven geen nieuw
assetformaat te krijgen: geïmporteerde dubbelzijdige kaarten gebruiken de
bestaande face-assets; lokaal gemaakte tokens zonder afbeelding voegen geen
download toe en blijven via hun tekstfallback offline bruikbaar.

De applicatie valideert of automatiseert geen mana, triggers, commander
verliescondities, tokenafleiding of combat.
