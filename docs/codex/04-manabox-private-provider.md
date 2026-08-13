# Codex Feature 4 — Publieke ManaBox private-packagegrens

## Belangrijk

Dit bestand staat in een **publieke repository** en bevat daarom opzettelijk geen
ManaBox-upstreamendpoint, requestconstructie, responseschema, browser/network-
capture, fixture of andere niet-openbare implementatiekennis.

De daadwerkelijke provideradapter en zijn Codex-instructies horen in de private
providerrepository.

## Lees eerst

Lees volledig:

- `AGENTS.md`
- `ROADMAP.md`
- `docs/architecture/010-provider-agnostic-deck-import.md`
- `docs/architecture/012-confidential-provider-adapters.md`
- `docs/architecture/015-private-provider-package.md`
- `docs/ci-cd.md`
- `docs/legal/PROVIDER_INTEGRATIONS.md`

## Scope in deze publieke repository

Bereid uitsluitend de veilige integratiegrens voor waarmee de officiële Import
Worker optioneel een private providerpackage kan gebruiken.

De publieke code mag bevatten:

- provider-neutraal adapterinterface;
- provider-capability/availabilitymodel;
- veilige unavailable stub;
- UI die een niet-beschikbare provider verbergt of netjes uitlegt;
- tests dat de publieke build zonder private component werkt;
- trusted-build hook/extension point, zolang die geen private technische kennis
  bevat.

## Fork-invariant

Een willekeurige fork zonder private token moet succesvol kunnen uitvoeren:

```sh
npm ci
npm run lint
npm run type-check
npm test
npm run build
```

Maak het private package daarom niet tot een verplichte normale dependency in de
publieke `package.json`/lockfile wanneer dat bovenstaande invariant breekt.

Inspecteer eerst de bestaande GitHub Actions-releaseflow. Kies daarna de kleinste
trusted-buildstrategie die een private server-side component alleen voor de
officiële deployment kan koppelen. PR-CI en forks krijgen die toegang nooit.

## Verboden in deze repository

Voeg niet toe:

- ManaBox niet-openbare upstreamadressen;
- requestpaden/parameters/headers waarmee de private interface kan worden
  gereconstrueerd;
- private responseschemas of raw fixtures;
- reverse-engineeringnotities;
- private repo/packagecredentials;
- originele providercorrespondentie;
- private packagebroncode;
- client-side fallback die de private interface alsnog nabouwt.

Als uitvoering van deze feature zulke informatie vereist, stop met dat deel en
verplaats die implementatie naar de private repository.

## Trusted release-eisen

De uiteindelijke koppeling moet:

- uitsluitend server-side in de Import Worker terechtkomen;
- geen private source maps of publieke artifacts opleveren;
- private packageauth alleen in trusted releasecontext gebruiken;
- secrets/logs maskeren;
- bij ontbrekende private component fail-closed of provider-disabled werken;
- Archidekt/Moxfield en de rest van de publieke build niet breken.

## Tests

Test minimaal:

- clean public `npm ci` zonder private auth;
- lint/typecheck/tests/build zonder private component;
- provider capability = unavailable in standaard publieke build;
- geen clientbundle/runtime-config bevat private module-informatie;
- officiële injectiegrens is server-only met mocks/stubpackage;
- ontbrekende private component breekt geen andere provider.

Gebruik in deze publieke tests alleen synthetische interfaces/stubs.

## Private vervolgstap

Maak in de private repository een afzonderlijke implementatieprompt die de
private adapter bouwt tegen het publieke providercontract. Die prompt mag niet
terug naar deze repository worden gekopieerd.
