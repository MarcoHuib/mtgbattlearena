# License boundaries

Laatst beoordeeld: 12 augustus 2026.

## 1. Eigen software versus materiaal van derden

Een softwarelicentie voor MTG Battle Arena kan uitsluitend rechten verlenen op materiaal waarvoor de projecteigenaar zelf voldoende rechten bezit.

Daarom vallen de volgende categorieën **niet automatisch** onder een eventuele open-sourcelicentie van de repository:

- Magic: The Gathering-kaartafbeeldingen, artwork, kaartframes en symbolen;
- Magic-kaartnamen, kaartteksten en andere door Wizards beschermde content voor zover daarop rechten rusten;
- Wizards-, Magic-, Scryfall- en Archidekt-logo's en handelsmerken;
- data of content van Archidekt, Scryfall of andere derden waarvoor afzonderlijke voorwaarden gelden;
- broncode van third-party dependencies, behalve onder hun eigen licenties.

## 2. Softwarelicentie

Voor de originele broncode van MTG Battle Arena is de **MIT License** een eenvoudige, gangbare open-sourcelicentie. De root van de repository hoort daarvoor een ongewijzigd `LICENSE`-bestand met de standaard MIT-tekst te bevatten.

MIT staat onder meer gebruik, wijziging, distributie, sublicentie en verkoop van de **eigen gelicentieerde software** toe. Die rechten kunnen alleen worden verleend voor materiaal waarop de projecteigenaar of contributors zelf voldoende rechten hebben.

Daarom geeft de MIT License **geen** rechten op:

- Wizards/Magic-IP;
- kaartafbeeldingen, artwork, kaartframes, symbolen of merken;
- Archidekt- of Scryfall-content;
- third-party dependencies buiten hun eigen licenties;
- andere materialen waarvan de rechten niet bij de projecteigenaar of contributor liggen.

Een downstream gebruiker die de MIT-code commercieel gebruikt, krijgt daarmee dus niet automatisch het recht om Wizards-fancontent of andere third-party content commercieel te gebruiken. Voor die materialen blijven de afzonderlijke rechten en voorwaarden van de betreffende rechthebbenden gelden.

> [!IMPORTANT]
> Een echte OSI-open-sourcelicentie zoals MIT mag commercieel gebruik van de software niet verbieden. Als het project de **eigen code** uitsluitend niet-commercieel beschikbaar wil stellen, is MIT niet geschikt en is zo'n licentie niet meer een standaard OSI-open-sourcelicentie.

## 3. Aanbevolen carve-out naast de softwarelicentie

Behoud in README en deze legal-documentatie een duidelijke scopeverklaring, bijvoorbeeld:

> De softwarelicentie van deze repository is uitsluitend van toepassing op originele broncode en originele documentatie van het project, tenzij anders vermeld. Zij verleent geen rechten op Magic: The Gathering-materiaal, kaartafbeeldingen, handelsmerken, third-party datasets of andere content van derden. Die materialen blijven onderworpen aan de rechten en voorwaarden van hun respectieve eigenaren.

Deze tekst vervangt de daadwerkelijke softwarelicentie niet; hij verduidelijkt alleen de scope.

## 4. Contributors

Als externe contributors worden toegelaten, moet duidelijk zijn dat zij alleen code/content mogen bijdragen waarvoor zij de noodzakelijke rechten hebben. Contributors mogen geen ongeautoriseerde artworkbestanden, commerciële assets, proprietary code of andere beschermde materialen toevoegen.

Voor een groter project kan een `CONTRIBUTING.md` met een Developer Certificate of Origin (DCO) of een afzonderlijke contributorregeling nuttig zijn.

## 5. Builds en distributie

Een gecompileerde build kan eigen softwarecode combineren met runtimeverwijzingen naar third-party content. Het feit dat die onderdelen technisch samen worden weergegeven, verandert hun afzonderlijke juridische status niet.

Vermijd daarom:

- het bundelen van een permanente kaartafbeeldingscollectie in releases;
- het presenteren van third-party artwork als onderdeel van de softwarelicentie;
- het herlicentiëren of sublicentiëren van third-party content;
- het verwijderen van verplichte dependency- of copyrightnotices.
