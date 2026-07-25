# ADR 004 — Contextacties en bekende decktokens

## Status

Geaccepteerd.

## Context

De compacte tafelranden raakten vol met losse zoneknoppen en het handmatige
tokenformulier maakte generieke kaarten zonder artwork. Archidekt levert bij
kaartdata stabiele verwijzingen naar de tokens die een deck kan maken, maar de
volledige tokenkaart staat niet in de gewone deckresponse.

## Besluit

- Libraryacties en battlefieldacties staan in lokale contextmenu-state. Zowel
  rechtermuisklik als een zichtbare knop in het zonelabel opent hetzelfde
  toegankelijke menu; Escape en klikken buiten het menu sluiten het.
- Definitieve acties blijven Redux-acties. Menucoördinaten en invoer voor
  tijdelijke aantallen worden niet opgeslagen.
- De importclient extraheert de token-ID's uit de gevalideerde deckresponse en
  vraagt deze in één begrensde request op via
  `GET /api/import/archidekt/tokens?ids=…`. De Worker blijft een gesloten proxy:
  alleen numerieke ID's, maximaal honderd en alleen de vaste Archidekt-route.
- Niet ieder tafelhulpmiddel is als `oracleCard.tokens` gekoppeld. Een kleine
  gecureerde keyword-extra-tabel voegt alleen helpers toe die expliciet uit
  gevalideerde deckkeywords volgen. Momenteel is `Foretell` ondersteund. Deze
  afleiding is algemeen en bevat geen deck-ID's.
- De genormaliseerde tokenkaarten worden als ongebruikte `CardDefinition`s aan
  de onveranderlijke decksnapshot toegevoegd. Pas bij **Token toevoegen** maakt
  de pure `createKnownToken`-operatie een nieuwe stabiele kaartinstance die
  dezelfde definitie en afbeelding hergebruikt.
- Wanneer de tokenresponse een Scryfall-UUID en `scryfallImageHash` bevat,
  reconstrueert de adapter de normale Archidekt-CDN-URL. Een expliciete
  afbeeldings-URL blijft leidend en de publieke Scryfall-CDN blijft fallback
  wanneer de Archidekt-hash ontbreekt.
- Bekende tokenassets lopen automatisch mee met de bestaande assetdeduplicatie
  en het expliciete offlinepakket. Omdat de Archidekt-CDN afbeeldingen wel in
  een `<img>` toont maar geen leesbare cross-origin respons voor Cache API
  garandeert, gebruikt uitsluitend de offline-downloader de vaste route
  `/api/import/archidekt/image/:uuid?face=…&hash=…`. De Worker valideert UUID,
  face en numerieke hash en kan daardoor niet als algemene fetchproxy worden
  gebruikt. Als tokenverrijking tijdelijk mislukt blijft deckimport bruikbaar,
  maar toont het tafelmenu een lege toestand.

## Compatibiliteit en gevolgen

Er is geen nieuw savegameschema nodig. De optionele `token.source`-metadata past
in het bestaande definitieformaat en oudere opgeslagen games blijven geldig.
Reeds geïmporteerde decksnapshots krijgen niet stilzwijgend nieuwe data; daarvoor
is een expliciete herimport nodig. Handmatig aangemaakte fallbacktokens blijven
in game-core ondersteund voor bestaande saves en tests, maar de battle-interface
maakt nieuwe tokens voortaan uit de bekende decklijst.
