# ADR 008 — Gedeelde “Roll for First Player”-flow

## Status

Geaccepteerd.

## Besluit

Iedere nieuwe offline en online wedstrijd doorloopt vóór de openingshand één
gedeelde startspelerflow. De gedeelde React-laag rendert
`FirstPlayerRollScreen`; alleen de runtime-adapter verschilt:

- offline gooit één gebruiker voor alle deelnemers en schrijft de pure
  game-core-transitie via Redux weg;
- online mag iedere speler uitsluitend voor zichzelf gooien en verstuurt de
  adapter een `ROLL_FOR_FIRST_PLAYER`-command zonder speler-ID of worpwaarde.

De authoritative Worker genereert online de D20-uitkomst, valideert
lidmaatschap, verwachte versie en deelname aan de actuele reroll, en publiceert
dezelfde openbare rollstate in iedere persoonlijke snapshot. De Worker blijft
de enige bron van waarheid. Hand- en libraryinformatie blijft buiten deze
publieke state.

## Offline spelersconfiguratie

De offline setup bewaart een geordende `playerOrder` en een map met stabiele
player-ID's. De gebruiker begint met twee seats en kan via `Speler toevoegen`
tot maximaal zes seats configureren. Iedere seat gebruikt dezelfde
deckimportcomponent en bevat een eigen naam en decksnapshot. Verwijderen is
alleen mogelijk zolang minimaal twee spelers overblijven.

`createGameForPlayers` bouwt uit deze configuratie de generieke
`Record<PlayerId, PlayerState>`, openingshandstatus, deckkoppelingen en
deelnemerslijst. `createGame` blijft als compatibele tweespelerwrapper bestaan
voor bestaande callers en tests. De gedeelde dobbelsteenflow,
openingshanddialogen en `BattleTable` itereren daarna uitsluitend over de
spelers uit de game-state; er worden geen visuele of tijdelijke mockspelers
toegevoegd.

`deckSnapshotIds` is daarom een collectie van twee tot zes IDs. Bestaande
tweespeler-savegames met schema 7 blijven geldig, terwijl de actuele
hydrateschema's ook dynamische player-ID's en multiplayergames accepteren.

## Domeinmodel en tie-regel

`GameState.firstPlayerRoll` bewaart deelnemers, huidige kandidaten, worpen,
afgevallen spelers, tied spelers, winnaar, startspeler, ronde en worpvolgorde.
De pure transitie `resolveFirstPlayerRoll` wordt door offline Redux, de
online Worker en testmocks gedeeld.

Na een ronde geldt:

1. één speler met de hoogste waarde wint direct;
2. delen meerdere spelers uitsluitend een lagere waarde, dan heeft dit geen
   invloed op een unieke hogere winnaar;
3. delen meerdere spelers de hoogste waarde, dan blijven alleen zij kandidaat;
4. hun vorige hoogste worpen worden gewist en alleen zij gooien opnieuw;
5. afgevallen spelers en hun laatste worp blijven zichtbaar.

Na bevestiging wordt de winnaar `activePlayerId` en `startPlayerId`, met
ronde 1 als begin. `turnNumber` betekent daarom voortaan rondenummer en stijgt
alleen wanneer de startspeler opnieuw aan de beurt komt.

## Randomness en manipulatie

Offline gebruikt de cryptografische browser-RNG met rejection sampling voor
waarden 1–20. Online accepteert het protocol bewust geen worpwaarde of
`playerId`; de Worker gebruikt zijn cryptografische RNG. Dubbel gooien,
gooien voor een ander, gooien buiten de actuele tie en spelacties vóór het
afronden van de flow worden geweigerd.

## Persistence, reconnect en oude data

Offline savegames gebruiken schema 7. Lopende oude savegames worden bij
migratie als reeds afgeronde startspelerflow gemarkeerd, zodat bestaande games
niet opnieuw hoeven te gooien. Nieuwe onafgeronde worpen worden normaal met de
game opgeslagen.

Online authoritative snapshots gebruiken schema 5. De volledige rollstate zit
in SQLite-snapshots en persoonlijke reconnectsnapshots. Een disconnect
verwijdert een deelnemer niet uit een reeds gestarte wedstrijd: diens plek en
worp blijven bestaan en de flow wacht op reconnect. Bij permanent vertrek kan
de host de wedstrijd afbreken; seats worden tijdens een actieve wedstrijd niet
stilzwijgend herschikt.

## UI en toegankelijkheid

De D20-presentatie, spelerpanelen, winner/tie-feedback en responsive layout
zijn volledig gedeeld. De animatie respecteert `prefers-reduced-motion`.
Worpen en de startactie zijn echte toetsenbordbedienbare knoppen, statusupdates
worden via `aria-live` aangekondigd en de startknop krijgt focus zodra een
winnaar bekend is.
