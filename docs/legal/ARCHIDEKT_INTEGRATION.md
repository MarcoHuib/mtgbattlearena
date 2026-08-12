# Archidekt integration — legal boundary

Laatst beoordeeld: 12 augustus 2026.

## Doel van de integratie

Archidekt is binnen MTG Battle Arena uitsluitend een optionele, door de gebruiker gekozen importbron voor openbare deckinformatie. De applicatie gebruikt de geïmporteerde informatie om een provider-neutraal intern deckmodel te maken.

Archidekt is geen image-CDN, geen runtime-afhankelijkheid voor gameplay en geen merkpartner van MTG Battle Arena.

## Contractueel aandachtspunt

De actuele Archidekt Terms of Service verlenen een beperkte, herroepbare licentie voor persoonlijke, niet-commerciële toegang tot de site en bevatten beperkingen voor geautomatiseerde agents/scripts en geautomatiseerde searches/requests/queries.

Daarom kan documentatie alleen het juridische risico van een server-side geautomatiseerde import niet wegnemen.

### Wat de voorwaarden wel en niet zeggen

De gepubliceerde Archidekt Terms verbieden het gebruik van software, automated agents of scripts om geautomatiseerde searches, requests of queries naar de site te genereren.

De Terms zeggen **niet** dat automated deck import automatisch is toegestaan wanneer vooraf schriftelijke toestemming wordt gevraagd, en zij beschrijven hiervoor geen standaard uitzonderingsprocedure.

Als MTG Battle Arena de huidige server-side URL-import wil behouden, kan een afzonderlijke expliciete toestemming, overeenkomst of officieel ondersteunde integratie met Archidekt het contractuele risico wegnemen of verduidelijken. Dat is een risicobeperkende aanbeveling voor dit project en geen citaat of bestaande uitzondering uit de Archidekt Terms.

De contractueel veiligste technische route zonder zo'n afzonderlijke afspraak is een **user-supplied export**: de gebruiker exporteert zelf een deck/decklist en levert die inhoud aan MTG Battle Arena, zodat MTG Battle Arena geen geautomatiseerde request naar Archidekt hoeft te doen.

Zolang de URL-import bestaat, moet deze technisch beperkt blijven tot door de gebruiker expliciet geïnitieerde imports van openbare decks, zonder crawling, bulkverzameling, periodieke synchronisatie of geautomatiseerde discovery. Die beperkingen reduceren belasting en scope, maar maken een request die onder de Terms verboden is niet vanzelf toegestaan.

## Technische grenzen die behouden moeten blijven

- alleen allowlisted Archidekt-hosts en bekende deck-id/routes;
- geen user-controlled arbitrary fetch URL;
- geen crawling of zoekindex van Archidekt;
- geen periodieke synchronisatie zonder expliciete useractie;
- geen bulkimport van willekeurige publieke decks;
- geen private decks tenzij een officieel ondersteunde autorisatieflow dat uitdrukkelijk toestaat;
- geen Archidekt-afbeeldingen doorproxyen;
- alleen de minimaal noodzakelijke deckvelden normaliseren;
- caching uitsluitend voor technische efficiëntie en niet voor het opbouwen van een zelfstandige Archidekt-database;
- stop/aanpasprocedure wanneer Archidekt daarom verzoekt of voorwaarden wijzigen.

## Geen impliciete toestemming

Het feit dat een publieke endpoint, exportknop of technisch bereikbare response bestaat, betekent niet automatisch dat onbeperkte geautomatiseerde verwerking contractueel is toegestaan.

Officiële voorwaarden: https://archidekt.com/terms
