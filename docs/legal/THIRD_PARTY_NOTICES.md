# Third-party notices

Laatst beoordeeld: 13 augustus 2026.

## Wizards of the Coast / Magic: The Gathering

MTG Battle Arena is een onafhankelijk, onofficieel fanproject. Magic: The
Gathering en bijbehorende namen, kaartteksten, illustraties, symbolen, frames en
andere materialen zijn eigendom van Wizards of the Coast LLC en/of hun
respectieve rechthebbenden.

Zie [`FAN_CONTENT_AND_IP.md`](FAN_CONTENT_AND_IP.md).

## Scryfall

Scryfall wordt gebruikt als technische bron voor kaartinformatie en/of
kaartafbeeldingen waar dat binnen de toepasselijke voorwaarden is toegestaan.
Scryfall draagt daarmee geen auteursrechten op Magic-artwork aan MTG Battle Arena
over. De applicatie behandelt kaartafbeeldingen niet als eigen assets.

Publieke documentatie: https://scryfall.com/docs/api

## Deckproviders

Archidekt, ManaBox en Moxfield kunnen als optionele deckimportbron worden gebruikt
in deployments waar de betreffende integratie is ingeschakeld.

Voor deze providers geldt publiek:

- imports zijn user-triggered en geen crawling/bulkindexering;
- providerdata wordt genormaliseerd naar een eigen provider-neutraal deckmodel;
- de integratie suggereert geen partnership, sponsorship of endorsement;
- projectspecifieke toegang of toestemming staat los van de open-sourcelicentie;
- vertrouwelijke toegangsmiddelen en niet-openbare providerimplementatiedetails
  worden niet in deze publieke repository gepubliceerd;
- huidige providervoorwaarden en projectspecifieke afspraken blijven leidend.

Zie [`PROVIDER_INTEGRATIONS.md`](PROVIDER_INTEGRATIONS.md) voor de publieke
samenvatting. De originele providercorrespondentie wordt privé bewaard.

Publieke voorwaarden:

- Archidekt: https://archidekt.com/terms
- ManaBox: https://manabox.app/termsofservice
- Moxfield: https://moxfield.com/help/terms

## Firebase / Google

Firebase wordt gebruikt voor hosting, authenticatie en aanverwante
client-/securityfuncties. Firebase en Google verlenen door hun dienstverlening
geen rechten op Magic-IP of andere content van derden. Hun eigen voorwaarden
blijven zelfstandig van toepassing.

## Cloudflare

Cloudflare wordt gebruikt voor edge- en serverfunctionaliteit van het project.
Cloudflare is een infrastructuurleverancier en is niet verantwoordelijk voor de
rechtenstatus van Magic-, Scryfall- of providercontent die het project binnen de
toepasselijke voorwaarden verwerkt.

## GitHub en dependencies

GitHub wordt gebruikt voor broncodehosting en CI/CD. NPM-packages en andere
dependencies behouden hun eigen licenties en notices. Een softwarelicentie van
MTG Battle Arena vervangt of verruimt de licenties van dependencies niet.

## Geen sublicentie

Niets in deze repository of documentatie verleent een sublicentie op Wizards-IP,
Scryfall-content, providerdata, vertrouwelijke providerinformatie of andere
materialen van derden. Voor zover toegang bestaat, gebeurt die uitsluitend binnen
de rechten en voorwaarden die de betreffende rechthebbende of dienstverlener
zelf toestaat.
