# Legal & compliance

Laatst beoordeeld: 13 augustus 2026.

Deze map beschrijft de juridische en licentiegrenzen van MTG Battle Arena. De
documenten maken onderscheid tussen eigen open-sourcecode, materiaal van derden
en externe diensten waarvoor afzonderlijke voorwaarden of project-specifieke
toestemming gelden.

> [!IMPORTANT]
> Deze documenten zijn geen juridisch advies en geven geen garantie tegen claims
> of wijzigingen in voorwaarden. De actuele voorwaarden en rechten van derden
> blijven leidend. Bij commerciële exploitatie, wezenlijke wijzigingen in het
> gebruik van providerdata of twijfel over een toestemming is beoordeling door
> een gespecialiseerde jurist verstandig.

## Documenten

- [`FAN_CONTENT_AND_IP.md`](FAN_CONTENT_AND_IP.md) — Wizards of the Coast,
  Magic-IP, kaartafbeeldingen en fancontent.
- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) — afbakening van externe
  diensten en content.
- [`LICENSE_BOUNDARIES.md`](LICENSE_BOUNDARIES.md) — scheiding tussen de
  Apache-2.0-code en rechten/voorwaarden van derden.
- [`PROVIDER_INTEGRATIONS.md`](PROVIDER_INTEGRATIONS.md) — publieke juridische
  grens voor Archidekt-, ManaBox- en Moxfield-deckimport.
- [`ARCHIDEKT_INTEGRATION.md`](ARCHIDEKT_INTEGRATION.md) — compatibiliteitslink
  naar de algemene providergrens.
- [`TAKEDOWN_POLICY.md`](TAKEDOWN_POLICY.md) — procedure voor meldingen over
  auteursrecht, merken, data en integratiegedrag.

## Kernprincipes

1. MTG Battle Arena is een onafhankelijk, onofficieel fanproject. Geen genoemde
   derde is door alleen de integratie sponsor, partner of goedkeurder van het
   project.
2. De repository verleent uitsluitend rechten op materiaal waarvoor de
   projecteigenaar/contributors die rechten kunnen verlenen.
3. Provider-specifieke toestemming of toegang staat los van de Apache License
   2.0 en wordt niet aan forks of downstreamgebruikers gesublicentieerd.
4. Deckimports zijn user-triggered. De applicatie crawlt of indexeert geen
   externe deckplatforms en bouwt geen concurrerende providerdataset op.
5. Niet-openbare providerinformatie, vertrouwelijke toegangsmiddelen en
   provider-specifieke interne implementatiedetails worden niet in de publieke
   repository of clientcode gepubliceerd.
6. De productie-implementatie respecteert providervoorwaarden, afgesproken
   gebruiksgrenzen en provider-imposed rate limits zonder die operationele
   details publiek te documenteren.
7. Een verzoek van een rechthebbende of provider om gebruik te beperken,
   wijzigen of stoppen wordt serieus onderzocht en waar nodig snel uitgevoerd.

## Officiële publieke bronnen

- Wizards of the Coast Fan Content Policy: https://company.wizards.com/en/legal/fancontentpolicy
- Wizards of the Coast Terms: https://company.wizards.com/en/legal/terms
- Archidekt Terms of Service: https://archidekt.com/terms
- ManaBox Terms of Service: https://manabox.app/termsofservice
- Moxfield Terms of Service: https://moxfield.com/help/terms
- Scryfall API/documentatie: https://scryfall.com/docs/api

Deze publieke bronnen kunnen wijzigen. Project-specifieke correspondentie wordt
privé bewaard en is bewust geen onderdeel van deze repository.
