# ADR 004 — Contextacties en bekende decktokens

## Status

Geaccepteerd.

## Context

De compacte tafelranden raakten vol met losse zoneknoppen en het handmatige
tokenformulier maakte generieke kaarten zonder artwork. De deckimportlaag levert bij
kaartdata stabiele verwijzingen naar de tokens die een deck kan maken, maar de
volledige tokenkaart staat niet in de gewone deckresponse.

## Besluit

- Libraryacties en battlefieldacties staan in lokale contextmenu-state. Zowel
  rechtermuisklik als een zichtbare knop in het zonelabel opent hetzelfde
  toegankelijke menu; Escape en klikken buiten het menu sluiten het.
- Definitieve acties blijven Redux-acties. Menucoördinaten en invoer voor
  tijdelijke aantallen worden niet opgeslagen.
- De provideradapter extraheert de voor tokenverrijking benodigde identifiers uit
  de gevalideerde deckimport en gebruikt daarvoor dezelfde begrensde server-side
  providerlaag. Provider-specifieke niet-openbare routes, requestdetails en
  responseschema's maken geen deel uit van de publieke documentatie.
- Niet ieder tafelhulpmiddel is als `oracleCard.tokens` gekoppeld. Een kleine
  gecureerde keyword-extra-tabel voegt alleen helpers toe die expliciet uit
  gevalideerde deckkeywords volgen. Momenteel is `Foretell` ondersteund. Deze
  afleiding is algemeen en bevat geen deck-ID's.
- De genormaliseerde tokenkaarten worden als ongebruikte `CardDefinition`s aan
  de onveranderlijke decksnapshot toegevoegd. Pas bij **Token toevoegen** maakt
  de pure `createKnownToken`-operatie een nieuwe stabiele kaartinstance die
  dezelfde definitie en afbeelding hergebruikt.
- Tokenafbeeldingen gebruiken hetzelfde provider-neutrale `ImageRef`-contract
  als gewone kaarten. Een geldige Scryfall printing-ID wordt gemapt naar resolver
  `1`; provider- of Scryfall-upstream-URL's worden niet in het publieke
  `ImportedDeck`-contract opgenomen. Een gecureerde helper zoals `Foretell`
  krijgt alleen een ImageRef als er werkelijk een geldige Scryfall printing-ID
  bestaat; een interne applicatie-UUID mag nooit als resolver-1-ID worden gebruikt.
- Bekende tokenassets lopen automatisch mee met de bestaande assetdeduplicatie
  en het expliciete offlinepakket. Zowel online rendering als offline-downloads
  gebruiken de centrale MTG Battle Arena CDN-URL uit ADR 011. Er is geen
  provider-imageproxy of providerfallback meer. Als tokenverrijking tijdelijk
  mislukt blijft deckimport bruikbaar, maar toont het tafelmenu een lege toestand.

## Compatibiliteit en gevolgen

Er is geen nieuw savegameschema nodig. De optionele `token.source`-metadata past
in het bestaande definitieformaat en oudere opgeslagen games blijven geldig.
Reeds geïmporteerde decksnapshots krijgen niet stilzwijgend nieuwe data; daarvoor
is een expliciete herimport nodig. Handmatig aangemaakte fallbacktokens blijven
in game-core ondersteund voor bestaande saves en tests, maar de battle-interface
maakt nieuwe tokens voortaan uit de bekende decklijst.
