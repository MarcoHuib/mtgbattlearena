# Deck-provider integrations — public legal boundary

Laatst beoordeeld: 13 augustus 2026.

Dit document beschrijft **alleen de publiek deelbare juridische en functionele
grens** van externe deckimports. Het is bewust geen technische handleiding voor
niet-openbare providerinterfaces.

## Gemeenschappelijke grens

MTG Battle Arena ondersteunt of kan deckplatforms ondersteunen als optionele
bronnen voor door de gebruiker gekozen deckimports. Daarbij gelden de volgende
publieke uitgangspunten:

- een import start alleen na een expliciete gebruikersactie;
- de applicatie crawlt, indexeert of bulk-downloadt geen deckplatforms;
- alleen gegevens die nodig zijn om het gekozen deck naar het eigen
  provider-neutrale deckmodel om te zetten worden verwerkt;
- providerdata wordt niet als zelfstandige of concurrerende dataset aangeboden;
- kaartafbeeldingen en andere third-party assets behouden hun eigen rechten en
  worden niet door deze integratietoestemming geherlicentieerd;
- providermerken worden alleen beschrijvend gebruikt en suggereren geen
  sponsorship, partnership of endorsement;
- provider-imposed gebruiks- en rate-limitvoorwaarden worden in productie
  afgedwongen;
- vertrouwelijke toegangsmiddelen, niet-openbare endpoints, requestdetails,
  responseschema's, fixtures en andere provider-specifieke interne kennis worden
  niet in deze publieke repository gepubliceerd wanneer de provider die
  informatie niet openbaar wil maken.

## Archidekt

Voor de beschreven user-triggered import-use-case heeft MTG Battle Arena
schriftelijke bevestiging ontvangen dat dit gebruik acceptabel is zolang het
project niet crawlt en binnen de grenzen van de dienst blijft.

De algemene Archidekt Terms bevatten daarnaast beperkingen voor geautomatiseerde
requests. De projecteigenaar bewaart daarom de projectspecifieke correspondentie
privé als aanvullende context voor de concrete integratie. Die correspondentie
wordt niet gepubliceerd en de toestemming wordt niet als algemene API-licentie
voor derden gepresenteerd.

Publieke Terms: https://archidekt.com/terms

## ManaBox

ManaBox heeft toestemming gegeven voor de beschreven user-triggered deckimport,
maar heeft uitdrukkelijk gevraagd dat de niet-openbare endpoint- en
implementatiekennis niet via de open-sourceimplementatie openbaar wordt gemaakt.

Daarom bevat de publieke repository uitsluitend provider-neutrale contracten en
functionele documentatie. De volledige niet-openbare ManaBox-adapter hoort in een
private server-side component/repository/package. Niet alleen een adres, maar ook
requestconstructie, responseschema's, mapping, private fixtures en andere kennis
waarmee de interface kan worden gereconstrueerd blijven buiten de publieke code.
Deze grens voorkomt dat de repository als de-facto documentatie voor een
niet-publieke interface gaat functioneren.

Publieke Terms: https://manabox.app/termsofservice

## Moxfield

Moxfield heeft projectspecifieke toegang verstrekt voor de beschreven import,
onder voorwaarden rond vertrouwelijkheid, gratis toegang tot de betreffende
datafunctie, zorgvuldig gebruik en provider-defined request limits. De
niet-publieke interface is unsupported en kan wijzigen.

De verstrekte toegangsinformatie wordt als gevoelige servercredential behandeld,
blijft buiten repository en client en wordt uitsluitend in een server-side secret
store gebruikt. MTG Battle Arena publiceert geen credential, private raw response
of onnodige niet-openbare providerimplementatiedetails. De Moxfield-import mag
niet als afzonderlijke betaalde toegang tot Moxfield-data worden verkocht of
achter een betaalmuur worden geplaatst zolang de huidige afspraken gelden.

Publieke Terms: https://moxfield.com/help/terms

## Geen overdracht aan forks of derden

De Apache License 2.0 van deze repository geldt voor de eigen gelicentieerde
software en documentatie. Zij verleent geen toegang tot niet-openbare
providerinterfaces en draagt geen projectspecifieke toestemming over.

Het project pretendeert deze providerrechten niet te sublicentiëren. Een fork,
herdistributie of andere onafhankelijke deployment moet zelf beoordelen welke
providerintegraties zijn toegestaan en waar nodig eigen toestemming of toegang
regelen.

## Wijzigingen en intrekking

Externe voorwaarden, interfaces en projectspecifieke afspraken kunnen wijzigen.
Als een provider vraagt om een integratie aan te passen, tijdelijk te beperken of
te stoppen, kan MTG Battle Arena de betreffende providerfunctionaliteit zonder
voorafgaande compatibiliteitsgarantie wijzigen of uitschakelen.

## Private evidence

Originele e-mails, screenshots, toegangsmiddelen en niet-openbare technische
informatie worden buiten de publieke repository bewaard. Publieke documentatie
vat alleen de voor het project relevante grenzen samen en publiceert geen
vertrouwelijke correspondentie.
