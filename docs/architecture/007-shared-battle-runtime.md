# ADR 007 — Eén gedeelde speeltafel met mode-adapters

## Status

Geaccepteerd.

## Context

De offline en online speeltafel waren als twee afzonderlijke React-
implementaties gegroeid. Daardoor bestonden drag-and-drop, kaartmenu's,
spelerpanelen, zones en statusbediening dubbel. De offline tafel kreeg nieuwe
functionaliteit die online ontbrak of anders werkte. Tegelijk moet offline
lokaal authoritative blijven en mag online uitsluitend een persoonlijke,
server-authoritative view gebruiken.

## Besluit

De offline tafel is de functionele en visuele bron van waarheid. Beide modi
renderen voortaan dezelfde presentatieboom:

- `BattleTable` voor de tafelcompositie en één dnd-kit-provider;
- `TableLayout` en `createTableSeats` voor de gedeelde 2–6-spelerindeling;
- `PlayerBoard`, `PlayerControls` en `MatchStatusBar`;
- `ZoneArea`, `CardView`, `CardGroupOverlay` en `CommanderTaxControl`;
- `ZoneActionMenu`, `ZoneBrowser`, `ZoneBrowseMenu` en kaartactiemenu's;
- `OpeningHandDialog` en `SelectionToolbar`.

Deze componenten kennen geen Redux-actions, WebSocketverbinding of mode-
specifiek protocol. Ze lezen één `BattleRuntime` en roepen één uniforme
`BattleRuntimeActions`-interface aan. Die interface bevat onder andere
verplaatsen, multiselect, tappen, counters, kaartzijden, attachments, groepen,
libraryacties, tokens, spelertrackers en beurt-/matchstatus.

### Bewust verschillende adapters

`useOfflineBattleRuntime`:

- leest de volledige lokale `GameState` uit Redux;
- laat alle lokale spelers besturen;
- vertaalt acties naar bestaande lokale reducers en pure game-core-transities;
- behoudt lokale undo/redo, autosave, IndexedDB en offlinepakketten.

`useOnlineBattleRuntime`:

- zet uitsluitend de gevalideerde persoonlijke serversnapshot om in het
  gedeelde, read-only tafelmodel;
- maakt geen instanties voor verborgen handen of libraries van tegenstanders;
- bewaart verborgen zones alleen als aantallen voor de presentatie;
- laat alleen de eigen server-toegewezen speler besturen;
- vertaalt dezelfde UI-acties naar strikt gevalideerde, versioned commands;
- muteert de ontvangen snapshot nooit optimistisch.

De twee routes houden alleen hun echte infrastructuurverschillen: de offline
shell toont undo/redo en offlinepakketbeheer; de online shell beheert
WebSocket/reconnect, serverversie en de hostactie om een game af te breken.

### Horizontale multiplayer-tafel

De herkenbare tweespeleropzet blijft de bouwsteen. `createTableSeats` groepeert
spelers uitsluitend op hun positie in de aangeleverde seatvolgorde:

- even index: bovenste rij;
- oneven index: onderste rij;
- `floor(index / 2)`: horizontale kolom;
- twee opeenvolgende spelers zijn elkaars tegenoverliggende speler.

Een oneven laatste speler krijgt een lege onderste seat in dezelfde kolom.
Deze visuele plaatsing leest geen actieve speler, startspeler of beurtstatus en
verandert de beurtvolgorde dus niet.

`TableLayout` rendert beide spelerlanes en de `MatchStatusBar` in één
tweedimensionale camera. De HUD staat in de normale middelste gridrij tussen de
boven- en onderrij en beweegt daarom verticaal met de tafellewereld mee. Alleen
de horizontale `left`-positie is sticky, zodat dezelfde ene HUD bij een brede
multiplayertafel in het viewport gecentreerd blijft. Er is geen lege
HUD-placeholder of verticaal gefixeerde overlay. Seats en spelerborden hebben
zelf geen overflow; spelers worden nooit als onafhankelijke scrollvakken of als
een verticale paginalijst toegevoegd.

Wheel-, Magic-Mouse- en trackpadinput wordt op de gedeelde `TableLayout`
afgevangen. `deltaX` en `deltaY` worden altijd naar respectievelijk
`scrollLeft` en `scrollTop` van de ene `table-layout__camera` doorgestuurd,
ongeacht of het event boven een kaart, battlefield, spelerrail, lege zone of
HUD begon. Shift-wheel blijft horizontale navigatie ondersteunen. Browserzoom
en wheelinput tijdens een actieve kaartdrag worden bewust niet onderschept.

`table-layout__camera` is de enige scroll-owner voor beide assen. Seats en
kaartzones gebruiken geen lokale `overflow: auto` meer. Daardoor kunnen een
seat, hand, library of andere zone geen eigen `scrollLeft` of `scrollTop`
opbouwen en blijven boven- en onderrij exact gekoppeld.
De tafeltrack vult altijd minstens de viewport en de browser begrenst de
camera-scrollpositie, zodat pannen geen onbedekte zwarte ruimte kan tonen.
Voor touch wordt tweedimensionale pointerbeweging op lege tafelruimte eveneens
naar de camera vertaald. Interactieve controls en draggable kaarten zijn
hiervan uitgesloten, zodat klikken, selecteren en kaartdrag hun bestaande
gedrag houden.

Offline en online leveren via hun bestaande runtime-adapter data en acties aan
dezelfde `BattleTable`, `TableLayout` en `PlayerBoard`-componenten.

### Gedeelde domeintransities

De Game Durable Object gebruikt dezelfde pure `game-core`-transities als de
offline dispatcher voor kaartverplaatsing, tappen, counters, kaartzijden,
attachments, tokens, groepen, trackers en beurtstatus. Het protocol voegt
alleen commandvalidatie, versiecontrole, eigenaarschap en autorisatie toe.

Voor acties op meerdere kaarten gebruikt online één atomair command, zoals
`MOVE_CARDS` of `TOGGLE_TAP` met meerdere instance-ID's. Hierdoor krijgt de
gedeelde multiselect-UI dezelfde semantiek zonder een reeks commands met
verouderde `expectedVersion`.

### Privacygrens

De gedeelde presentatie betekent nadrukkelijk geen gedeelde authoritative
clientstate. `onlineSnapshotToGameState` kan alleen kaarten materialiseren die
de persoonlijke snapshot daadwerkelijk bevat. Handen en libraryvolgorde van
tegenstanders ontbreken uit Redux, DOM en protocolpayloads. Publieke
battlefieldgroepen en zichtbare kaartzijden mogen wel worden gedeeld.

## Gevolgen

- Een wijziging aan een tafelcomponent is standaard zichtbaar in beide modi.
- Nieuwe tafelacties moeten eerst aan `BattleRuntimeActions` en game-core
  worden toegevoegd en daarna door beide kleine adapters worden ondersteund.
- Een nieuwe `OnlineCard`, `OnlinePlayerBoard`, online zone of online
  contextmenu is niet toegestaan; mode-specifieke presentatie hoort alleen
  wanneer de onderliggende informatie of infrastructuur werkelijk verschilt.
- Offline blijft zonder account, Firebase, Worker of netwerk bruikbaar.
- Online blijft server-authoritative en bevestigt iedere wijziging via een
  nieuwe persoonlijke snapshot.

## Verificatie

Webintegratietests openen zowel de offline als online route en gebruiken
dezelfde `data-battle-card`, `data-battle-draggable` en
`data-battle-drop-zone`-contracten. Adaptertests bewijzen dat alleen de eigen
verborgen kaarten naar het gedeelde tafelmodel gaan. Workerintegratietests
bewijzen dat multiselect, tap, counters, kaartzijden en groepen authoritative
worden toegepast en in persoonlijke snapshots zonder geheime tegenstanderdata
terugkomen.
