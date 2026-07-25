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

## Eerste verticale slice

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
  rand blijft volledig bruikbaar. Opnieuw slepen verplaatst en verhoogt de
  kaart.
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
`GET /api/import/archidekt/:numeriekDeckId`, gebruikt een timeout en
responslimiet, cachet kort en vertaalt upstreamfouten naar een stabiel
JSON-formaat. Er zijn geen secrets nodig.

Voor een eigen Cloudflare-account:

```sh
npx wrangler dev
npx wrangler deploy
```

Koppel in productie dezelfde `/api/import/archidekt/*`-route aan de Worker.
Deployment zelf is niet uitgevoerd en vereist eigen Cloudflare-toegang.

## Huidige beperkingen

- Alleen openbare Archidekt-decks worden ondersteund.
- Kaarttoken-afleiding, commander damage, commander tax en vrij benoembare
  custom counters volgen in latere slices.
- Oudere battles zonder opgeslagen battlefieldposities krijgen eerst een
  veilige automatische spreiding; na verslepen wordt de vrije positie duurzaam
  opgeslagen.
- Verwijderen en beheren van meerdere oude savegames/offlinepakketten heeft nog
  geen aparte bibliotheekinterface.
- Persistente browseropslag kan niet worden afgedwongen; de app toont de
  werkelijk toegekende status.
