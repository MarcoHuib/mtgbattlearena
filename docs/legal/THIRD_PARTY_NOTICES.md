# Third-party notices

Laatst beoordeeld: 12 augustus 2026.

MTG Battle Arena gebruikt of integreert diensten en materiaal van derden. Geen van de hieronder genoemde partijen sponsort, ondersteunt of keurt MTG Battle Arena goed, tenzij dat later uitdrukkelijk schriftelijk wordt overeengekomen.

## Wizards of the Coast / Hasbro

Magic: The Gathering en bijbehorende namen, kaartinhoud, illustraties, symbolen, handelsmerken en overige materialen behoren toe aan Wizards of the Coast LLC, Hasbro en/of hun respectieve rechthebbenden.

Gebruik binnen MTG Battle Arena is bedoeld als onofficieel fancontentgebruik onder de actuele Wizards Fan Content Policy. Zie [`FAN_CONTENT_AND_IP.md`](FAN_CONTENT_AND_IP.md).

## Scryfall

Scryfall wordt in de huidige architectuur gebruikt als technische upstream voor kaartafbeeldingen via de afzonderlijke Image Worker.

Belangrijke grenzen:

- MTG Battle Arena is niet verbonden aan of goedgekeurd door Scryfall;
- het Scryfall-logo en de Scryfall-branding worden niet als eigen branding gebruikt;
- de frontend is provider-neutraal en vraagt afbeeldingen op via `cdn.mtgbattlearena.nl`;
- de Image Worker beperkt upstreamverkeer tot de bedoelde Scryfall image-host en valideert iedere request/redirect;
- beschikbaarheid via Scryfall betekent niet dat auteursrechten op Magic-artwork aan dit project worden verleend;
- toepasselijke Scryfall-gebruiksregels, technische richtlijnen en beperkingen moeten worden gerespecteerd.

Scryfall geeft aan dat bestanden op `*.scryfall.io` niet onder dezelfde API-rate-limit vallen als `api.scryfall.com`; dit is een technische gebruiksrichtlijn en geen overdracht van IP-rechten.

## Archidekt

Archidekt is uitsluitend een door de gebruiker gekozen bron voor het importeren van openbare deckinformatie. MTG Battle Arena gebruikt Archidekt niet als runtime-imageprovider en presenteert Archidekt-content niet als eigen databank.

Belangrijke grenzen:

- geen Archidekt-logo of branding als eigen merk;
- geen suggestie van samenwerking, sponsorship of goedkeuring;
- geen bulk-scraping, crawling of opbouw van een concurrerende Archidekt-dataset;
- geen gebruik van private deckdata zonder toestemming/toegang van de gebruiker;
- de importlaag normaliseert providerdata naar een eigen, provider-neutraal deckmodel;
- kaartafbeeldingen worden niet vanaf Archidekt doorgeleverd.

Let op: de actuele Archidekt Terms of Service bevatten beperkingen op geautomatiseerde requests/scripts en verlenen slechts een beperkte persoonlijke, niet-commerciële toegang tot de site. Zie [`ARCHIDEKT_INTEGRATION.md`](ARCHIDEKT_INTEGRATION.md).

## Firebase / Google

Firebase wordt gebruikt voor hosting, authenticatie en aanverwante client-/securityfuncties. Firebase en Google verlenen door hun dienstverlening geen rechten op Magic-IP of andere content van derden. Hun eigen servicevoorwaarden, privacyvoorwaarden en productvoorwaarden blijven zelfstandig van toepassing.

## Cloudflare

Cloudflare wordt gebruikt voor Workers, Durable Objects, WebSockets en CDN/edge-verwerking. Cloudflare is een infrastructuurleverancier en is niet verantwoordelijk voor de inhoud of rechten van Magic-, Scryfall- of Archidekt-materiaal dat door het project wordt verwerkt.

## GitHub en dependencies

GitHub wordt gebruikt voor broncodehosting en CI/CD. NPM-packages en andere dependencies behouden hun eigen licenties en notices. Een softwarelicentie van MTG Battle Arena vervangt of verruimt de licenties van dependencies niet.

Bij distributie van builds moet de projecteigenaar ervoor zorgen dat verplichte dependency-notices en licentieteksten worden behouden voor zover de betreffende licenties dat eisen.

## Geen sublicentie

Niets in deze repository of documentatie verleent een sublicentie op materiaal van Wizards, Scryfall, Archidekt of andere derden. Voor zover gebruikers toegang krijgen tot dergelijke materialen, gebeurt dat uitsluitend binnen de grenzen van de rechten die de betreffende rechthebbende zelf toestaat.
