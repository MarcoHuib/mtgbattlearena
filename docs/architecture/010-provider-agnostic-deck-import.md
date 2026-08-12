# ADR 010 — Provider-onafhankelijke deckimport

## Besluit

Deckimport gebruikt een provider-neutrale grens:

```text
user-supplied deck reference
→ provider selection
→ constrained provider adapter
→ validation and normalization
→ MTG Battle Arena ImportedDeck
→ application API
→ offline game / authoritative online game
```

`ImportedDeck` is een eigen domeincontract van MTG Battle Arena. Providerresponses
of provider-specifieke objectstructuren maken geen deel uit van het publieke
applicatiecontract en bereiken de browser niet.

## Sources, revisions en gebruikerskeuze

Een `DeckSource` identificeert een externe of interne bron. Een `DeckRevision`
is één onveranderlijke, provider-neutrale importweergave. `UserDeck` koppelt de
keuze van een gebruiker aan een revision en `GameDeckSnapshot` bevriest die
deckinhoud bij game-start.

Deze scheiding zorgt ervoor dat gameplay na import niet afhankelijk blijft van
de externe provider en dat een wijziging in een providerinterface niet het
spelprotocol hoeft te veranderen.

## Provider- en securitygrens

De browser krijgt geen generieke upstream-fetchmogelijkheid. Een gebruiker levert
een deckreferentie aan de applicatie; server-side code selecteert uitsluitend een
expliciet ondersteunde provider en retourneert alleen het genormaliseerde
`ImportedDeck`-contract.

Alle provideradapters volgen minimaal deze principes:

- user-triggered imports; geen crawling of bulkindexering;
- allowlisting en SSRF-bescherming passend bij de provider;
- timeout-, responsgrootte- en validatiegrenzen;
- foutmaskering richting de client;
- minimale logging zonder vertrouwelijke providerinformatie;
- caching alleen voor technische efficiëntie en niet als providerdataset;
- provider-imposed gebruiks- en requestlimieten worden server-side afgedwongen.

Sommige providers staan toe dat hun adapter volledig in open source staat.
Andere providers vereisen dat niet-openbare integratiedetails buiten de publieke
repository blijven. In dat geval bevat deze repository uitsluitend het
provider-neutrale contract; de niet-openbare adapterkennis wordt niet gepubliceerd.
Zie [ADR 012](./012-confidential-provider-adapters.md).

## Fingerprint en cache

Een bronfingerprint vertegenwoordigt de inhoud die voor het eigen deckmodel
relevant is. Niet-semantische providerstatistieken of timestamps horen niet bij
de fingerprint wanneer ze de speelbare deckinhoud niet veranderen.

De gedeelde cache bevat uitsluitend gevalideerde provider-neutrale importdata.
Raw providerresponses worden niet als publieke domeinobjecten opgeslagen of naar
clients doorgestuurd. Een cachemisser of stale hint mag nooit clientdata als
autoritatieve providerinformatie behandelen; de server valideert de actuele
bron opnieuw wanneer dat nodig is.

## Offline/online-pariteit

Na import kan een lokale snapshot zelfstandig voor gameplay worden gebruikt.
Online voegt identiteit, autorisatie, serveropslag, randomness, persoonlijke
views en realtime transport toe, maar verandert de decksemantiek niet.

## Nieuwe provider

Een nieuwe provider moet hetzelfde `ImportedDeck`-contract opleveren en dezelfde
security- en juridische grens respecteren. Provider-specifieke interne details
worden alleen in de publieke repository opgenomen wanneer dat verenigbaar is met
de voorwaarden en toestemming van die provider.
