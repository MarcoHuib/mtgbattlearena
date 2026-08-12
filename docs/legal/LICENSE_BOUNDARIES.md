# License boundaries

Laatst beoordeeld: 13 augustus 2026.

## 1. Eigen software versus materiaal van derden

De root `LICENSE` bevat de **Apache License 2.0**. Die licentie kan alleen rechten
verlenen op materiaal waarvoor de projecteigenaar of contributors voldoende
rechten hebben.

Daarom vallen onder andere de volgende categorieën **niet automatisch** onder de
Apache License 2.0 van deze repository:

- Magic: The Gathering-kaartafbeeldingen, artwork, kaartframes en symbolen;
- Magic-kaartnamen, kaartteksten en andere beschermde Wizards-content voor zover
  daarop rechten rusten;
- logo's en handelsmerken van Wizards, Scryfall, Archidekt, ManaBox, Moxfield en
  andere derden;
- providerdata en andere third-party content waarvoor afzonderlijke voorwaarden
  gelden;
- niet-openbare providerinterfaces, projectspecifieke toegang of toestemming;
- broncode van third-party dependencies, behalve onder hun eigen licenties.

## 2. Softwarelicentie

De originele broncode en originele documentatie waarop het project de benodigde
rechten bezit, worden onder de **Apache License 2.0** aangeboden zoals opgenomen
in het rootbestand [`LICENSE`](../../LICENSE).

De Apache License 2.0 staat onder haar voorwaarden onder meer gebruik,
wijziging, distributie en commercieel gebruik van de **gelicentieerde eigen
software** toe. Die rechten verruimen geen rechten op materiaal of diensten van
derden.

Een downstreamgebruiker kan dus de Apache-2.0-code gebruiken zonder daarmee
automatisch het recht te verkrijgen om Magic-IP, providerdata of een
niet-openbare providerintegratie op dezelfde wijze te gebruiken.

## 3. Provider-specifieke toestemming is geen open-sourcelicentie

MTG Battle Arena heeft voor bepaalde deckproviders projectspecifieke schriftelijke
bevestiging of toegang voor de beschreven integratie. Die afspraken:

- staan los van de Apache License 2.0;
- worden niet als onderdeel van de repository gesublicentieerd;
- maken vertrouwelijke toegangsmiddelen of niet-openbare providerkennis niet
  openbaar;
- geven forks of onafhankelijke deployments niet automatisch dezelfde rechten.

Zie [`PROVIDER_INTEGRATIONS.md`](PROVIDER_INTEGRATIONS.md).

## 4. Public/private codegrens

Provider-neutrale interfaces, domeinmodellen en eigen applicatielogica mogen in
de publieke repository staan. Provider-specifieke onderdelen die volgens een
afspraak vertrouwelijk of niet-openbaar moeten blijven, worden niet met de
publieke broncode gedistribueerd.

Het feit dat een production build aanvullende, rechtmatig verkregen private
componenten kan gebruiken, verandert de licentie van de publieke Apache-2.0-code
niet en verleent geen licentie op die aanvullende componenten of providerrechten.

## 5. Contributors

Contributors mogen alleen code en content bijdragen waarvoor zij de noodzakelijke
rechten hebben. Voeg geen geheime providerinformatie, private correspondentie,
proprietary code, ongeautoriseerde artworkbestanden of andere beschermde
materialen toe aan pull requests, issues, fixtures of testdata.

## 6. Builds en distributie

Een build kan eigen software combineren met runtimeverwijzingen naar content of
diensten van derden. Dat verandert de afzonderlijke juridische status van die
onderdelen niet.

Vermijd daarom onder meer:

- het bundelen van een permanente kaartafbeeldingscollectie in releases;
- het presenteren van third-party artwork/data als onder de Apache License 2.0;
- het publiceren van vertrouwelijke providerinformatie in source maps, fixtures,
  logs, build artifacts of clientbundles;
- het herlicentiëren of sublicentiëren van third-party content;
- het verwijderen van verplichte dependency-, copyright- of attributionnotices.
