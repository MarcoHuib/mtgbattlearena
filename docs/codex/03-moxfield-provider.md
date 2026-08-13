# Codex Feature 3 — Moxfield provider

## Lees eerst

Lees volledig:

- `AGENTS.md`
- `ROADMAP.md`
- `docs/architecture/010-provider-agnostic-deck-import.md`
- `docs/architecture/012-confidential-provider-adapters.md`
- `docs/architecture/014-moxfield-queued-imports.md`
- `docs/legal/PROVIDER_INTEGRATIONS.md`

Feature 2 moet aantoonbaar werken tegen mocks.

## Scope

Sluit de Moxfield provider aan op de bestaande provider-neutrale importgrens en
laat iedere echte Import/Update-call uitsluitend via de Feature-2 queue lopen.
De uiteindelijke Create/Update-resultaten gebruiken de Feature-1 Firestore Deck
Library-mutations; Moxfield krijgt geen eigen permanente opslagmodel.

## Secretbehandeling

De projectspecifieke Moxfield-toegang is een gevoelige servercredential.

- nooit hardcoden;
- nooit committen;
- nooit naar browser/runtime-config sturen;
- nooit loggen of in errors opnemen;
- runtime lezen uit een Cloudflare Worker Secret of gelijkwaardige server-side
  secret store;
- als provisioning via GitHub Actions nodig is, alleen een GitHub Secret als
  bron gebruiken en nooit een gewone Repository Variable;
- documenteer alleen de **naam/vereiste** van een secret wanneer nodig, nooit de
  waarde of een realistisch voorbeeld ervan.

De implementatie moet fail-closed reageren wanneer de credential ontbreekt.

## Providercontract

- accepteer alleen de expliciet ondersteunde publieke deckreferenties;
- geen generieke fetchproxy;
- valideer externe data runtime;
- begrens responsegrootte en timeout;
- map uitsluitend naar het bestaande `ImportedDeck`-contract;
- raw upstreamresponses bereiken de client niet;
- bij een mislukte Update blijft de bestaande Firestore librarycontent intact;
- import en update blijven voor gebruikers gratis beschikbaar binnen deze
  integratie.

De upstream is niet-publiek/unsupported en kan veranderen. Bouw daarom duidelijke
provider-unavailable/invalid-data foutcodes zonder interne details te lekken.

## Queue-invariant

Er mag geen providerfunctie bestaan die vanuit productiecode rechtstreeks zonder
de queue kan worden aangeroepen. Test dit architecturaal waar mogelijk.

## Tests

Gebruik mocks en synthetische/minimaal noodzakelijke fixtures zonder credential.
Test minimaal:

- geldige import naar `ImportedDeck`;
- ongeldige URL;
- malformed/gewijzigde response;
- timeout;
- ontbrekende credential;
- credential komt niet in logs/errors;
- Import en Update gaan beide via queue;
- mislukte Update bewaart oude Firestore metadata/content;
- duplicate normale import gebruikt de Feature-1-regel;
- queue-cooldown/pendingstatus blijft zichtbaar in de Deck Library.

Voer geen echte providerrequests uit in CI.

## Buiten scope

- ManaBox-private implementatie;
- publiceren van private API-documentatie;
- automatische crawling/polling;
- providerimport achter een betaalmuur;
- ongerelateerde gameplayrefactors.

## Afronding

Werk alleen publieke documentatie bij met provider-neutrale feiten. Publiceer geen
private correspondentie, credentials, raw responses of extra upstreamkennis.
