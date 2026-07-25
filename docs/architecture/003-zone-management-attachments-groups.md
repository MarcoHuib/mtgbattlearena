# ADR 003 — Zonebeheer, attachments en permanente groepen

## Status

Geaccepteerd.

## Context

Grote Commander-games vragen om doorzoekbare nevenzones en een manier om
attachments en zelfgekozen piles te administreren. Dit mag de applicatie niet
veranderen in een rules engine en mag de centrale zone-invarianten niet
omzeilen.

## Besluit

- `moveCard` blijft de enige primitieve operatie die een kaart tussen zones
  verplaatst. Library-acties voor bovenop en onderop gebruiken deze operatie en
  wijzigen daarna uitsluitend de volgorde van de library-ID's.
- `CardInstance.attachedTo` verwijst naar een stabiel battlefield-instance-ID.
  Attachments vereisen dezelfde controller, mogen niet naar zichzelf wijzen en
  een keten mag geen cyclus vormen. Wanneer een kaart het battlefield verlaat,
  worden inkomende en uitgaande koppelingen verwijderd; geen enkele kaart wordt
  automatisch mee verplaatst.
- `GameState.groupsById` bevat duurzame `CardGroup`-records met naam,
  player-ID, kaartinstance-ID's, genormaliseerde positie en inklapstatus. Een
  kaart kan administratief in maximaal één groep zitten. De zone blijft
  `battlefield`.
- Groepsverplaatsingen berekenen één delta op basis van de groepspositie en
  passen die in één Redux-actie op alle leden toe. Individuele z-volgorde blijft
  behouden.
- De zonebrowser bewaart open/dicht, zoekterm, filters, weergave en tijdelijke
  selectie lokaal in React. Alleen definitieve kaart-, attachment- en
  groepsacties worden naar Redux gestuurd.
- Savegames gebruiken schema 5. De migratie van schema 4 initialiseert
  `groupsById` en verwijdert ongeldige of cyclische oude attachmentverwijzingen.
  History-snapshots worden met dezelfde migratie behandeld.

## Gevolgen

Autosave, refreshherstel en offline hervatten bewaren attachments en groepen
zonder nieuwe netwerkafhankelijkheid. De UI biedt semantische knoppen,
toetsenbordsluiting van dialogs en alternatieven voor drag-and-drop. Equipkosten,
targetlegaliteit, aura- en state-based actions blijven bewust handmatig en
buiten scope.
