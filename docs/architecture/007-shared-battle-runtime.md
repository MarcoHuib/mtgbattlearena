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
- `TableLayout`, `createTableSeats` en `createPerspectiveTableSeats` voor de
  gedeelde 2–6-spelerindeling;
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

Voor een persoonlijke online view (en de lokaal bestuurde offline view) past
`createPerspectiveTableSeats` uitsluitend de rendervolgorde aan. De
`viewerPlayerId` uit de gevalideerde persoonlijke serversnapshot komt altijd
onderaan in kolom nul; de vorige speler in de absolute seatvolgorde komt daar
tegenover te liggen. De overige spelers volgen cyclisch rond de tafel. De
authoritative `turnOrder`, player-ID's en state worden hierbij niet gewijzigd.
Wanneer er geen lokale speler is, zoals bij een spectator, blijft de absolute
seatvolgorde gelden. Daardoor kan iedere online deelnemer dezelfde wedstrijd
vanuit het eigen perspectief bekijken zonder browserafhankelijk gedrag of
duplicatie van de tafelcomponenten.

`PlayerBoard` gebruikt dezelfde `viewerPlayerId` voor de interne oriëntatie:
het eigen battlefield ligt richting de HUD en de eigen hand aan de buitenste,
onderste rand. Een bovenste tegenstander gebruikt de gespiegelde publieke
weergave. Identiteit en perspectief blijven daarmee twee expliciete stappen:
de online adapter bepaalt de lokale speler uit `privateView.playerId`, waarna
de gedeelde layout alleen de visuele plaatsing berekent.

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

### Dubbelzijdige kaarten en preview

Een kaartdefinitie bewaart de bekende zijden in `faces` en de bijbehorende
assets per `faceIndex` in `imageRefs`. Iedere fysieke `CardInstance` bewaart
zelfstandig `activeFaceIndex`; meerdere exemplaren van dezelfde definitie
kunnen daardoor onafhankelijk transformeren. De provideradapter normaliseert
bekende kaartzijdes naar provider-neutrale `faces` plus `ImageRef`s per
`faceIndex`. Er wordt geen back-URL uit een deckprovider-URL afgeleid. Alleen wanneer brondata een geldige printing-ID/zijde ondersteunt,
kan een tweede ImageRef ontstaan. Normale kaarten, meld-layouts en oude snapshots
met alleen een voorkant blijven enkelzijdig.

De gedeelde `CardView` toont één kaartactiedialoog in beide modi. De actie
`Kaart omdraaien` roept `BattleRuntimeActions.switchFace` aan. Offline loopt
dit via de Redux-history en de normale autosavelistener; online wordt alleen
het versioned `SWITCH_FACE`-command met een instance-ID verzonden. Game-core en
de Game Durable Object accepteren dit alleen voor een kaart met exact twee
zijden op het battlefield; online moet de geverifieerde speler bovendien de
controller zijn. De bestaande centrale persoonlijke broadcast maakt de nieuwe
publieke zijde daarna voor alle deelnemers zichtbaar.

`CardFacePreview` vormt bewust geen onderdeel van `BattleRuntime`. De
previewzijde is componentlokale React-state, start bij iedere dialoogopening op
`activeFaceIndex` en verdwijnt bij sluiten. De knop `Andere zijde bekijken`
dispatcht daarom geen Redux-action, start geen autosave en verstuurt geen
servercommand. Een niet gecachte of ontbrekende afbeelding geeft een lokale
foutstatus; de game-state en de zichtbare battlefieldzijde blijven intact.

Offlinepakketten blijven `collectGameAssets` gebruiken. Omdat deze alle
`imageRefs` van iedere gebruikte definitie verzamelt, worden voor een
dubbelzijdige kaart automatisch zowel de front- als backasset gededupliceerd
en gedownload.

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
