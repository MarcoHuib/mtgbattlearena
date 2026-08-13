# ADR 015 — Private providerpackage zonder open-source builddependency

## Status

Proposed — 13 augustus 2026.

## Context

ManaBox staat de beoogde user-triggered integratie toe, maar wil niet dat
niet-openbare endpoint- en implementatiekennis onderdeel wordt van de publieke
open-sourcecode. Alleen het verplaatsen van een upstreambasis-URL naar een secret
is onvoldoende wanneer requestconstructie, schemas, mapping of andere interne
kennis nog steeds uit de openbare repository kan worden afgeleid.

Tegelijkertijd moet een fork van MTG Battle Arena normaal installeerbaar,
testbaar en buildbaar blijven zonder toegang tot projectspecifieke private code.

## Besluit

De volledige niet-openbare ManaBox-adapter wordt onderhouden in een aparte
private repository/package en uitsluitend server-side gebruikt door de officiële
deployment.

De publieke repository bevat alleen:

- provider-neutrale interfaces en domeincontracten;
- een capability/availabilitygrens;
- een veilige stub voor deployments zonder private provider;
- gebruikersgerichte fout- of unavailable-statussen;
- generieke securitytests zonder private fixtures.

De private component bevat alle informatie die de niet-publieke providerinterface
zou kunnen onthullen, waaronder upstreamkennis, requestopbouw,
runtimevalidatieschemas, mapping, captures en private fixtures.

## Geen verplichte private dependency

De private provider wordt **niet** als gewone verplichte dependency in de
publieke package-lock vastgelegd als dat `npm ci` voor forks zou breken.

Een publieke clone moet zonder private credentials of private registrytoegang
kunnen uitvoeren:

```sh
npm ci
npm run lint
npm run type-check
npm test
npm run build
```

De standaard publieke build behandelt de provider als niet beschikbaar. Alleen
een trusted officiële releasecontext mag de private adapter server-side
injecteren of koppelen.

De precieze injectie-/packagingtechniek wordt pas gekozen nadat de bestaande
releaseworkflow in Feature 4 is geïnspecteerd. Welke techniek ook wordt gekozen,
de bovenstaande fork-invariant is bindend.

## Vertrouwelijkheidsgrens

Private providerbroncode of -informatie mag niet terechtkomen in:

- de publieke repository of git history;
- publieke package-lockmetadata die authenticatie vereist om te installeren;
- browserbundles of runtime-config;
- publieke source maps;
- GitHub Actions logs of publieke artifacts;
- testfixtures, snapshots of errorpayloads;
- issues of pull requests in de publieke repository.

## Forks en rechten

Een fork ontvangt geen private package, package-registrycredential of
projectspecifieke providerrechten. Een fork kan de providerfunctie uitgeschakeld
laten of zelf een afzonderlijk toegestane integratiemethode regelen.

## Gevolgen

De officiële deployment kan een provider ondersteunen zonder een extra Worker te
vereisen, terwijl de publieke open-source repository zelfstandig bruikbaar
blijft. De releaseflow wordt wel complexer omdat trusted builds optioneel een
private server-side component moeten kunnen koppelen.
