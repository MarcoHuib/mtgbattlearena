# ADR 012 — Vertrouwelijke provideradapters

## Status

Accepted — 13 augustus 2026.

## Context

MTG Battle Arena is open source, maar niet iedere externe deckprovider biedt een
publieke, gedocumenteerde interface. Voor sommige integraties heeft het project
specifieke toestemming gekregen met de voorwaarde dat vertrouwelijke toegang of
niet-openbare technische details niet via de openbare repository worden verspreid.

Open source van de applicatie betekent niet dat informatie van derden die onder
een afzonderlijke afspraak beschikbaar is, eveneens openbaar gemaakt mag worden.

## Besluit

De publieke repository bevat:

- provider-neutrale interfaces en domeinmodellen;
- gebruikersgerichte providerselectie en foutafhandeling;
- generieke security-eisen voor imports;
- tests van het publieke contract zonder vertrouwelijke providerfixtures.

Provider-specifieke implementaties die niet openbaar mogen worden gemaakt worden
**niet** in deze repository opgenomen. Een deployment kan zo'n adapter als
private server-side component of build dependency toevoegen, maar de browser en
de publieke repository hoeven de interne providerinterface niet te kennen.

De openbare applicatie communiceert uitsluitend via eigen provider-neutrale
contracten. Daardoor wordt de repository geen handleiding voor niet-publieke
providerinterfaces.

## Vertrouwelijkheidsgrens

Niet opnemen in publieke source, documentatie, issues, tests, fixtures, examples,
source maps of logs wanneer het om niet-openbare providerinformatie gaat:

- toegangsmiddelen of authenticatiemateriaal;
- niet-openbare upstreamadressen of routekennis;
- provider-specifieke requestconstructie;
- niet-openbare responseschema's of raw voorbeeldresponses;
- reverse-engineeringnotities en browser/network captures;
- originele private correspondentie met providers.

Publieke documenten mogen wel de functionele en juridische grens noemen, zoals
het feit dat toestemming bestaat, dat crawling niet is toegestaan, dat toegang
kan worden ingetrokken en dat provider-defined gebruikslimieten worden nageleefd.


## Geplande private-packagevorm

Voor providers waarvoor ook de technische adapterkennis niet openbaar mag worden,
kiest het project bij voorkeur voor een private server-side repository/package in
plaats van een extra publieke Worker. De publieke repository behoudt alleen een
provider-neutraal contract en een veilige unavailable/capabilitygrens.

Een belangrijke open-source invariant is dat een fork zonder private toegang nog
steeds normaal `npm ci`, lint, typecheck, tests en build kan uitvoeren. Een private
provider mag daarom niet als verplichte gewone dependency in de publieke lockfile
worden opgenomen wanneer dat forks of PR-CI zou breken. Alleen een trusted officiële
releasecontext mag zo'n private component server-side koppelen.

Zie [ADR 015](./015-private-provider-package.md) voor het voorgestelde doelmodel.

## Operationele verantwoordelijkheid

De exacte technische maatregelen waarmee production deployments vertrouwelijke
providerinformatie beschermen zijn bewust geen onderdeel van deze publieke ADR.
Ze moeten in de private operationele documentatie worden onderhouden en regelmatig
worden beoordeeld.

## Open-source forks

Forks ontvangen de Apache-2.0-code in deze repository, maar niet automatisch
private adapters, provideraccess of projectspecifieke toestemming. Een fork moet
zelf een toegestane integratiemethode regelen of de providerfunctie uitschakelen.

## Gevolgen

Voordelen:

- providerafspraken worden gerespecteerd;
- de browser bevat geen onnodige providerkennis;
- AI-agents en crawlers kunnen niet via deze repository eenvoudig een
  niet-publieke providerinterface reconstrueren;
- de publieke architectuur blijft provider-neutraal.

Nadeel:

- een volledig zelfstandige fork kan providerfuncties die private componenten
  vereisen niet automatisch reproduceren. Dat is bewust en volgt uit de
  afzonderlijke rechten- en vertrouwelijkheidsgrens.
