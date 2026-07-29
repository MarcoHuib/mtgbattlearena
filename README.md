# MTG Battle Mode

Een onofficiële, local-first digitale tafel waarop één gebruiker twee openbare
Archidekt-decks tegenover elkaar speelt. De app houdt toestand bij, maar is
bewust geen automatische Magic-regelsimulator.

## Lokale ontwikkeling

Vereisten: een actuele Node.js-versie en npm.

```sh
npm install
npm run dev
```

De Vite-devserver stuurt uitsluitend
`/api/import/archidekt/:numeriekDeckId` door naar de vaste Archidekt-deckroute.
Dit is alleen een lokale ontwikkelfallback; productie hoort de meegeleverde
Worker te gebruiken.

## Scripts

```sh
npm run dev          # lokale Vite-server
npm run format       # Prettier schrijft formatting
npm run format:check # controleert formatting
npm run lint         # ESLint
npm run type-check   # strikte TypeScript-controle
npm test             # Vitest unit- en integratietests
npm run test:e2e     # Playwright kritieke offlineflow
npm run build        # TypeScript en productie-PWA-build
npm run preview      # productiebuild lokaal bekijken
```

## Fase 1 — local-first verticale slice

- Twee afzonderlijke Archidekt-URL's valideren en importeren.
- Ruwe externe data runtime valideren en normaliseren naar `ImportedDeck`.
- Deckpreview met naam, commanders, kaartenaantal en een onafhankelijk
  fout-/laadpad.
- Battle starten met commanders in de command zone, geschudde libraries en
  zeven kaarten per hand.
- Beide spelers doorlopen afzonderlijk een openingshandfase: de eerste twee
  mulligans blijven zeven kaarten, de derde wordt zes en iedere volgende één
  kaart minder.
- Eén herbruikbaar `PlayerBoard` voor beide spelers: de battlefields liggen
  tegenover elkaar aan de middenlijn en de handen aan de buitenranden, terwijl
  alle kaarten rechtop en leesbaar blijven.
- Kaarten slepen en via het kaartactiemenu tussen zones verplaatsen; open het
  menu met de rechtermuisknop of met `Shift+F10` wanneer de kaart focus heeft.
  Op het ruime battlefield blijft iedere kaart exact op de gekozen, vrij
  schaalbare x/y-positie liggen, zonder raster-snap. Het vastgepakte punt blijft
  tijdens slepen onder de pointer, de kaart zoomt dan niet in en ook de onderste
  rand blijft volledig bruikbaar. Een drop heeft geen terugspringanimatie naar
  de oude zone: de kaart staat direct stil op de gekozen plek en hoverzoom wordt
  pas na een nieuwe pointerbeweging actief. De compacte randmarge is gelijk voor
  rechte en getapte kaarten, zodat ze ook langs de speelveldrand op dezelfde rij
  kunnen staan. Opnieuw slepen verplaatst en verhoogt de kaart.
- Kaarten zelf 1,5× vergroten via muis-hover of toetsenbordfocus; commander en
  Background worden als overlappende commandergroep getoond. Een ingezoomde
  hand- of commandkaart blijft volledig zichtbaar en ligt tijdelijk boven
  naburige zones en battlefieldkaarten.
- Battlefieldkaarten exact 90° tappen/untappen en veelgebruikte counters
  (`+1/+1`, `-1/-1`, loyalty en charge) bijhouden.
- Met **Next turn** van actieve speler wisselen, diens battlefield untappen en
  automatisch de bovenste kaart trekken.
- Leven aanpassen en de laatste actie undo/redo uitvoeren.
- Libraries tonen een lokaal meegeleverde natuurlijke Magic-kaartachterkant.
- Iedere relevante actie gedebouncet opslaan in IndexedDB en de laatste battle
  bij reload hervatten.
- Een expliciet offlinepakket met duurzame voortgang per unieke kaartzijde
  downloaden, annuleren en mislukte assets opnieuw proberen.
- PWA-app-shell met zichtbare updateprompt en tekstuele kaartfallbacks.

## Fase 2 — Commander-playtest

- Alle zes zones zijn bruikbaar: library, hand, battlefield, graveyard, exile
  en command zone. Het kaartmenu kan een kaart naar iedere andere zone
  verplaatsen.
- Kaarten blijven vrij en genormaliseerd op het battlefield staan. Met
  Ctrl/⌘-klik of een tik selecteer je meerdere kaarten; de selectiebalk
  verplaatst ze samen. Een geselecteerde kaart kan daar ook worden
  getapt/untapt, naar voren of achteren gezet en van een snelle
  `+1/+1`-counter worden voorzien.
- Rechtermuisklik of `Shift+F10` opent het volledige kaartmenu. Op touch zijn
  selectie en de selectiebalk de zichtbare alternatieven voor essentiële
  acties.
- Dubbelzijdige kaarten kunnen van actieve zijde wisselen. Alle zijden blijven
  onderdeel van een expliciet offlinepakket.
- Draw, draw X, mill X, shuffle, mulligan en library zoeken/bekijken staan in
  het library-contextmenu. **Untap alles** staat bij de battlefieldacties.
  **Volgende fase** doorloopt beginfase, beide hoofdfasen, combat en eindfase;
  **Volgende beurt** wisselt de actieve speler, untapt en trekt automatisch.
- Elke speler begint met 40 leven. De compacte spelerstatus toont poison met
  de `10`-drempel, optioneel Energy, Experience en Rad, City’s Blessing,
  handmatig uitschakelen en ontvangen commander damage met de `21`-drempel.
  Pure Background-enchantments krijgen geen commander-damageteller; twee
  creature-commanders worden volgens de Commander-regel afzonderlijk
  bijgehouden.
- Commander tax staat per commanderkaart in de command zone. Partner- en
  Background-decks behouden daar beide afzonderlijke taxwaarden.
- Monarch, Initiative en Day/Night staan eenmaal centraal op de battle line,
  samen met actieve speler, beurt en fase. Monarch en Initiative hebben ieder
  maximaal één houder; Day/Night is globale matchstate.
- De import neemt bekende tokenkaarten uit het deck mee. Rechtermuisklik op
  lege battlefieldruimte opent **Tafelacties**, waar tokens met hun echte
  kaartafbeelding vanaf Archidekts kaart-CDN en eventuele power/toughness
  gekozen worden. Tokens kunnen vervolgens worden gedupliceerd; oudere
  fallbacktokens blijven leesbaar. De Foretell-helper wordt daarnaast afgeleid
  uit het gevalideerde deckkeyword, omdat Archidekt die niet als gewone
  token-ID terugstuurt.
- Naast snelle `+1/+1`- en `-1/-1`-acties ondersteunt het kaartmenu vrij
  benoemde counters met verhogen en verlagen.
- Alle blijvende fase-2-gegevens vallen onder dezelfde undo/redo- en
  autosaveketen. Selectie en pointerpositie zijn bewust vluchtig en worden niet
  duurzaam opgeslagen.

### Belangrijkste bediening

- Slepen: kaart of geselecteerde groep definitief verplaatsen.

## Fase 3 — zonebeheer, attachments en groepen

- Library, graveyard, exile en command zone hebben een toegankelijke
  zonebrowser. Deze biedt grid- en lijstweergave, zoeken op naam, typefilter,
  sorteren op naam of mana value en multiselect voor veilige zoneacties.
- Graveyard en exile zijn op tafel compacte open stapels: alleen de laatst
  toegevoegde kaart ligt zichtbaar bovenop. Hun actiemenu opent zoeken of de
  volledige zonebrowser; exile staat in de zijrail direct onder graveyard.
- De library blijft als compacte stapel op tafel. In de browser kun je bewust
  de bovenste X kaarten bekijken, kaarten bovenop of onderop plaatsen en na een
  zoekactie expliciet kiezen of je schudt. Zoeken schudt nooit automatisch. Het
  zonelabel heeft nog maar één actiemenuknop; hetzelfde menu opent met
  rechtermuisklik op de library.
- Battlefieldkaarten kunnen handmatig als attachment aan een ander permanent
  worden gekoppeld. Meerdere attachments zijn mogelijk; cycli worden geweigerd.
  Als een betrokken kaart het battlefield verlaat, wordt alleen de
  administratieve koppeling verwijderd. Er worden geen Magic-regels uitgevoerd.
- Twee of meer geselecteerde permanents kunnen als duurzame, benoemde groep
  worden opgeslagen. Groepen kunnen worden in- en uitgeklapt, als geheel worden
  verplaatst, uitgebreid, verkleind en opgeheven. De kaarten blijven gewone
  battlefieldinstances en vormen geen nieuwe zone.
- Alle duurzame acties lopen via Redux en doen mee met autosave, undo en redo.
  Dialogstatus, zoekfilters en tijdelijke browserselecties blijven lokale
  UI-state.
- Dubbelklik: battlefieldkaart exact 90 graden tappen/untappen.
- Rechtermuisklik / `Shift+F10`: volledig kaartactiemenu.
- Tappen of untappen vanuit het kaartmenu sluit dat menu direct. De
  tapstatus wordt alleen door de 90°-rotatie getoond, zonder extra badge.
- Rechtermuisklik op de library: trekken, draw X, mill X, zoeken, top-X bekijken
  en schudden. De knop met drie puntjes biedt hetzelfde zonder rechtermuisklik.
- Rechtermuisklik op lege battlefieldruimte: tafelacties en bekende decktokens
  toevoegen op de aangeklikte positie.
- Ctrl/⌘-klik of tik: kaart aan de multiselect toevoegen of eruit verwijderen.
- Spelerrail: leven, poison, optionele trackers, City’s Blessing, handmatige
  uitschakeling en compacte commander-damageregistratie.

## Architectuur

De code blijft bewust één Vite-app; er is voor deze slice geen monorepo
geïntroduceerd.

```text
src/
  game-core/       pure modellen, state-overgangen, assets en migraties
  archidekt/       URL-parser, Zod-schema, adapter en netwerkclient
  app/             store, listener middleware, typed hooks en app-thunks
  features/
    setup/         importstate en setupinterface
    game/          actieve genormaliseerde game en undo/redo
    battle/        gespiegeld tafeloppervlak en kaartinteracties
    offline/       manifeststate, downloadservice en voortgangsinterface
    ui/            gedeelde scherm-, boot- en autosavestatus
  persistence/     repositoryinterfaces, Dexie en Cache API-adapters
worker/            begrensde Archidekt-importproxy
e2e/               Playwright kritieke flow
```

Kaartdefinities en fysieke kaartinstanties zijn gescheiden. `cardsById` is
genormaliseerd en spelerzones bevatten alleen instance-ID's. Reducers benaderen
IndexedDB of Cache API nooit direct; listener middleware en services gebruiken
repositoryinterfaces.

De actuele savegame heeft schemaversie 6. Hydratie migreert versies 1–5 en
voegt veilige defaults toe voor fase, spelertrackers, City’s Blessing,
handmatige uitschakeling en centrale matchstatus. Tokens, counters, actieve
kaartzijde, vrije posities, tax, damage en statuswaarden staan in de duurzame
game-state; geopende panelen, multiselect en lopende pointerinteractie niet.

Zie [ADR 001](docs/architecture/001-local-first-boundaries.md) voor het
onderscheid tussen Redux, duurzame opslag, tijdelijke cache en expliciete
offlinepakketten.

## Offlinegedrag

Een gestart spel wordt na relevante acties in IndexedDB opgeslagen. De
serviceworker bewaart daarnaast de app-shell en mag remote afbeeldingen
opportunistisch cachen.

De knop **Download voor offline gebruik** is een aparte, expliciete handeling:

1. alle bekende kaartzijdes worden op een stabiele assetsleutel
   gededupliceerd;
2. maximaal vier assets worden tegelijk opgehaald;
3. afbeeldingen komen in `mtg-battle-offline-assets-v1`;
4. voortgang, bytes en fouten worden per asset in IndexedDB bijgewerkt;
5. het pakket wordt pas `complete` als iedere vereiste asset aanwezig is.

Een kaart zonder afbeelding blijft speelbaar met naam en type als fallback. De
UI meldt wanneer de browser geen persistente opslag garandeert.

## Import-Worker

`worker/archidekt-worker.js` accepteert alleen
`GET /api/import/archidekt/:numeriekDeckId` en de begrensde tokenroute
`GET /api/import/archidekt/tokens?ids=…`. Voor offlinepakketten bestaat ook de
strikt gevalideerde afbeeldingsroute
`GET /api/import/archidekt/image/:uuid?face=…&hash=…`; deze kan alleen naar het
vaste Archidekt-CDN-pad. De Worker gebruikt een timeout en responslimiet, cachet
kort en vertaalt upstreamfouten naar een stabiel formaat. Er zijn geen secrets
nodig.

Voor een eigen Cloudflare-account:

```sh
npx wrangler dev
npx wrangler deploy
```

Koppel in productie dezelfde `/api/import/archidekt/*`-route aan de Worker.
Deployment zelf is niet uitgevoerd en vereist eigen Cloudflare-toegang.

## Huidige beperkingen

- Alleen openbare Archidekt-decks worden ondersteund.
- Bekende tokens worden afgeleid uit de expliciete Archidekt-tokenverwijzingen,
  niet uit vrije oracletekst. Reeds geïmporteerde decks moeten opnieuw worden
  geïmporteerd om de nieuwe tokenlijst te krijgen. Als Archidekt geen tokenkaart
  levert, blijft een functionele lege toestand beschikbaar.
- Commander damage en tax worden handmatig bijgehouden. Waarden van `21`
  commander damage, `10` poison of leven op nul tonen alleen een waarschuwing;
  de app schakelt een speler nooit automatisch uit.
- Multiselect ondersteunt samen verplaatsen en enkele snelle acties, maar nog
  geen lasso-selectie.
- Oudere battles zonder opgeslagen battlefieldposities krijgen eerst een
  veilige automatische spreiding; na verslepen wordt de vrije positie duurzaam
  opgeslagen.
- Verwijderen en beheren van meerdere oude savegames/offlinepakketten heeft nog
  geen aparte bibliotheekinterface.
- Persistente browseropslag kan niet worden afgedwongen; de app toont de
  werkelijk toegekende status.
