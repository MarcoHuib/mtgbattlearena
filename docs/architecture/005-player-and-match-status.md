# ADR 005 — Spelerdashboard en centrale matchstatus

## Status

Geaccepteerd. Deze ADR introduceerde savegameschema 6; de actuele offline savegameversie is schema 7.

## Context

`PlayerControls` combineerde duurzame spelerwaarden met algemene library- en
battlefieldacties. Daardoor raakte de spelerrail vol, terwijl globale statussen
zoals Monarch, Initiative en Day/Night geen natuurlijke eigenaar per speler
hebben. Commander tax hoort bovendien bij de commander die opnieuw vanuit de
command zone wordt gespeeld.

## Besluit

- De spelerrail is een compact statusdashboard. Leven is primair; poison,
  optionele Energy-, Experience- en Rad-trackers, City’s Blessing, handmatig
  uitschakelen en ontvangen commander damage zijn secundair.
- Libraryacties worden uitsluitend aangeboden via het bestaande
  library-contextmenu. `Untap alles` wordt uitsluitend aangeboden via het
  battlefield-contextmenu. Beide menu’s houden hun geopende toestand en
  tijdelijke invoer lokaal.
- Commander tax blijft een duurzame waarde per commander-instance-ID, maar de
  bediening staat bij iedere commanderkaart in de command zone. Partner en
  Background houden dus elk hun eigen tax.
- `matchStatus` bevat één optionele Monarch-houder, één optionele
  Initiative-houder en één globale Day/Night-status. Actieve speler, beurt en
  fase blijven bestaande velden op `GameState`; de UI brengt deze waarden samen
  op de battle line.
- City’s Blessing en handmatig `disabled` blijven per speler. Geen enkele
  drempel verandert `disabled` automatisch.
- Alleen leven op nul of lager, poison op tien of hoger en 21 commander damage
  van één commander leveren waarschuwingssignalen op. De waarden worden niet
  afgekapt.
- Commander damage wordt per creature-commander weergegeven. Een pure
  Background-enchantment krijgt geen eigen damagebediening; twee
  Partner-creature-commanders blijven afzonderlijk omdat commander damage
  volgens de Commander-regel niet wordt gecombineerd.

## Duurzaamheid en compatibiliteit

Savegameschema 6 voegt aan iedere speler `trackers`, `visibleTrackers`,
`citysBlessing` en `disabled` toe en voegt eenmaal `matchStatus` aan de game
toe. De migratie van versie 5 initialiseert veilige nul-/uit-defaults en
`none`/`null` voor globale statussen. De migratie wordt ook op undo- en
redo-snapshots toegepast.

Alle blijvende wijzigingen lopen via pure game-corefuncties en Redux-acties en
vallen daarmee onder dezelfde autosave-, undo/redo- en offline-herstelketen.
Native `details`, contextmenu’s en tijdelijke menucoördinaten worden niet
opgeslagen.
