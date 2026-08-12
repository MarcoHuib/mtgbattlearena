> **Status:** historische prompt voor de oorspronkelijke offline verticale slice. `ONLINE_MULTIPLAYER_PROMPT.md` is eveneens historische implementatiecontext; de actuele architectuur staat in de ADR’s, met name 006–011. De beperkingen in dit bestand gelden alleen voor deze eerste mijlpaal.

Lees `AGENTS.md` volledig voordat je wijzigingen maakt. Dit bestand is leidend.

We bouwen de eerste production-ready verticale slice van **MTG Battle Mode**. Bouw nog geen volledige Magic-regelsimulator en voeg nog geen accounts, cloud sync, online multiplayer of React Native-app toe.

Inspecteer eerst de bestaande repository, package manager, scripts, TypeScript-configuratie, linting, tests, buildconfiguratie en eventuele deploymentbestanden. Geef daarna een kort implementatieplan en voer het direct uit zonder opnieuw toestemming te vragen, behalve wanneer een secret, betaalde externe resource of destructieve handeling nodig is.

## Doel van deze opdracht

Lever één werkende end-to-end flow op:

1. De gebruiker kan twee openbare Archidekt-deck-URL’s invoeren.
2. Beide URL’s worden gevalideerd en het numerieke deck-ID wordt herkend.
3. De decks worden via een afgeschermde importlaag opgehaald en naar een intern `ImportedDeck`-contract genormaliseerd.
4. De gebruiker ziet per deck een preview met minimaal decknaam, commander(s), kaartenaantal en foutstatus.
5. De gebruiker kan een battle starten.
6. Commanders gaan naar de command zone, de overige kaarten worden geschud en iedere speler trekt zeven kaarten.
7. De battle toont twee herbruikbare, gespiegeld weergegeven `PlayerBoard`-componenten.
8. De gebruiker kan kaarten minimaal verplaatsen van hand naar battlefield en van battlefield naar graveyard.
9. De gebruiker kan een kaart tappen/untappen en de levenspunten per speler aanpassen.
10. Iedere relevante actie wordt automatisch lokaal opgeslagen.
11. Na een paginareload wordt de lopende battle exact hersteld.
12. De gebruiker kan kiezen voor **“Download voor offline gebruik”**.
13. De app maakt dan een offlinepakket met beide decks, kaartmetadata en alle benodigde unieke kaartafbeeldingen.
14. Downloadvoortgang, mislukte assets en uiteindelijke offline-status worden zichtbaar gemaakt.
15. Na succesvolle download moet de app-shell en de opgeslagen battle opnieuw geopend kunnen worden wanneer netwerkrequests zijn uitgeschakeld.
16. Een ontbrekende kaartafbeelding blokkeert de game niet; toon dan een functionele kaartfallback met ten minste de kaartnaam.

## Technische uitgangspunten

Gebruik of behoud, tenzij de bestaande repository aantoonbaar een betere passende basis heeft:

- React;
- TypeScript strict;
- Vite;
- Redux Toolkit en React Redux;
- dnd kit;
- IndexedDB achter repositoryinterfaces;
- een service worker/PWA-oplossing voor app-shell en assetcaching;
- Vitest en React Testing Library;
- Playwright voor de kritieke flow.

Kies een onderhouden IndexedDB-wrapper wanneer dat de implementatie duidelijker en betrouwbaarder maakt. Verberg die dependency achter repositoryinterfaces zodat de domeinlaag niet van de opslagbibliotheek afhankelijk wordt.

Gebruik geen Firebase en geen SSR.

## Architectuureisen

### 1. Pure gedeelde domeinlaag

Zet platformonafhankelijke TypeScript-logica in een duidelijke `game-core`- of domeinmodule. Deze code mag geen DOM-, browser- of React-imports hebben.

Maak minimaal modellen voor:

- `CardDefinition`;
- `CardInstance`;
- `DeckSnapshot`;
- `ImportedDeck`;
- `PlayerState`;
- `GameState`;
- `OfflineBattlePackage`;
- zones en battlefieldposities.

Maak expliciet onderscheid tussen kaartdefinities en kaartinstanties.

Bewaar kaartinstanties genormaliseerd in `cardsById`. Zones bevatten alleen instance-ID’s.

### 2. Redux Toolkit

Maak minimaal slices of logisch gescheiden reducers voor:

- deckimport/setup;
- actieve game;
- offlinepakket/downloadstatus;
- alleen gedeelde UI-state die werkelijk globaal nodig is.

Gebruik expliciete actions voor minimaal:

- game starten;
- kaart trekken;
- kaart verplaatsen;
- tap/untap;
- leven wijzigen;
- battle hydrateren;
- undo van de laatste relevante gameactie wanneer haalbaar binnen deze slice.

Stuur geen pointerbewegingen naar Redux. Dispatch alleen bij een definitieve drop.

### 3. Persistence

Definieer repositoryinterfaces voor:

- deck snapshots;
- savegames;
- offlinepakketten;
- assetmetadata.

Implementeer deze voor IndexedDB.

Gebruik Redux listener middleware, thunks of een applicatieservice om relevante gameacties met een korte debounce automatisch op te slaan.

Voorzie schemaversies in duurzame records.

### 4. Archidekt-import

Maak een geïsoleerde importmodule met:

- URL-parser;
- runtime-validatie van externe data;
- adapter van externe response naar intern `ImportedDeck`;
- duidelijke fouttypen;
- fixtures voor tests.

De React-componenten en game-reducers mogen geen velden uit het ruwe Archidekt-schema kennen.

Gebruik bij voorkeur een kleine proxy/BFF in de repository, bijvoorbeeld een Cloudflare Worker, die alleen geldige Archidekt-deck-ID’s accepteert. Bouw geen generieke URL-proxy.

Wanneer deployment of externe configuratie van de Worker secrets of accounttoegang vereist, implementeer dan wel de Worker-code, lokale ontwikkelconfiguratie en een testbare mock/fallback, maar maak geen betaalde resource aan en vraag geen accountgegevens.

### 5. Offlinepakketten

Maak een expliciet offlineproces; vertrouw niet alleen op opportunistische browsercache.

Bij “Download voor offline gebruik”:

1. verzamel alle unieke benodigde assets;
2. dedupliceer op stabiele kaart/face/variant-sleutel;
3. neem beide faces van dubbelzijdige kaarten mee;
4. download assets met beperkte concurrency;
5. sla voortgang per asset duurzaam op;
6. ondersteun retry van mislukte assets;
7. markeer het pakket pas als compleet wanneer alle verplichte data lokaal beschikbaar is;
8. toon een waarschuwing wanneer browser persistent storage niet is toegekend;
9. maak tijdelijk offline cachen en expliciet offline opslaan zichtbaar verschillend in code en UI.

Gebruik een resolverservice voor kaartafbeeldingen met deze volgorde:

1. expliciet lokaal offlinebestand/cache-entry;
2. reeds automatisch gecachte asset;
3. remote URL wanneer netwerk beschikbaar is;
4. tekstuele kaartfallback.

### 6. PWA/app-shell

Zorg dat de productiebuild installeerbaar/offline startbaar is voor zover de gekozen Vite/PWA-oplossing dit ondersteunt.

Cache de app-shell conservatief. Maak geen strategie waarbij oude JavaScript-versies onbeperkt blijven hangen.

Voorzie een duidelijke updateflow wanneer een nieuwe appversie klaarstaat.

## UI-eisen

Maak minimaal deze schermen/toestanden:

### Import/setup

- twee afzonderlijke URL-velden;
- importstatus per speler;
- deckpreview per speler;
- duidelijke validatie- en netwerkfouten;
- knop “Battle starten” pas actief wanneer beide decks bruikbaar zijn;
- mogelijkheid om één deck opnieuw te importeren zonder het andere kwijt te raken.

### Battle

- twee `PlayerBoard`-instanties uit dezelfde component;
- command zone;
- library met resterend aantal;
- hand;
- battlefield;
- graveyard;
- levenspunten;
- tap/untap;
- drag-and-drop tussen de vereiste zones;
- kaartfallback zonder afbeelding;
- autosave-indicator;
- online/offline-indicator;
- knop “Download voor offline gebruik”.

### Offline download

- aantal unieke assets;
- voortgang in aantallen en waar mogelijk bytes;
- status per pakket;
- retry bij fouten;
- annuleren wanneer redelijk uitvoerbaar;
- duidelijke melding wanneer de battle volledig offline beschikbaar is.

### Hervatten

Bij opstarten:

- laad een bestaande actieve game uit lokale opslag;
- bied “Hervatten” en “Nieuwe battle” aan;
- overschrijf een bestaande game niet stilzwijgend.

## Toegankelijkheid

Drag-and-drop mag niet de enige manier zijn om een kaart te verplaatsen.

Voeg een toegankelijk kaartactiemenu toe met minimaal:

- naar battlefield;
- naar hand;
- naar graveyard;
- naar exile;
- naar command zone wanneer van toepassing;
- tap/untap.

Gebruik semantische knoppen, zichtbare focus, alt-teksten en aria-live voor import-, save- en downloadstatus.

## Testvereisten

Maak betrouwbare tests zonder live externe afhankelijkheid.

### Unit

Test minimaal:

- verschillende geldige en ongeldige Archidekt-URL’s;
- normalisatiefixture;
- commanderselectie;
- kaartinstancegeneratie;
- deterministische shuffle;
- draw seven;
- zoneverplaatsing;
- tap/untap;
- levenswijziging;
- assetdeduplicatie;
- serialisatie/hydratatie.

### Integratie/component

Test minimaal:

- twee decks importeren met mocks;
- battle starten;
- kaart via alternatief actiemenu verplaatsen;
- autosave/hydratie;
- offline downloadstatus en foutpad.

### End-to-end

Automatiseer minimaal:

1. importeer twee fixturedecks;
2. start battle;
3. verplaats een kaart;
4. tap de kaart;
5. pas leven aan;
6. reload;
7. controleer herstelde state;
8. download voor offline gebruik;
9. zet netwerk in Playwright offline;
10. reload;
11. open dezelfde battle en controleer dat de kerninterface en lokaal opgeslagen kaartweergaven beschikbaar zijn.

## Niet bouwen in deze opdracht

- automatische Magic-regels;
- mana-validatie;
- automatische combat;
- online multiplayer;
- login/accounts;
- cloud saves;
- vier spelers;
- deckeditor;
- private Archidekt-decks;
- Moxfield-import;
- React Native-app;
- betaalde infrastructuur.

## Kwaliteitscontrole

Voer na implementatie uit:

- formattering indien aanwezig;
- lint;
- TypeScript-typecheck;
- unit/integratietests;
- Playwright-tests of ten minste de relevante kritieke flow;
- productiebuild.

Corrigeer fouten voordat je afrondt.

Werk minimaal bij:

- `README.md` met lokale setup, scripts, architectuuroverzicht en offlinegedrag;
- een korte ADR of architectuurnotitie over local-first persistence, Redux versus duurzame opslag en het onderscheid tussen cache en offlinepakket;
- eventuele Worker-configuratie-instructies zonder secrets te committen.

Sluit af met:

1. wat je hebt gebouwd;
2. belangrijke architectuurkeuzes;
3. uitgevoerde controles en resultaten;
4. bekende beperkingen;
5. de kleinste logische volgende slice.
