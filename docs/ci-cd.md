# CI/CD

`main` is de single source of truth voor iedere release. Development gebeurt
lokaal; pull requests naar `main` valideren code zonder credentials of
deployment. Na merge promoot één workflow dezelfde release eerst naar Beta en
daarna naar Production.

```text
feature/* → PR naar main → CI → merge naar main
                                      │
                                      ▼
                               Release Build #X
                                      │
                                      ▼
                             Beta · Build #X
                                      │ success required
                                      ▼
                         Production · Build #X
```

| Omgeving    | GitHub Environment | Bron                        | Frontend                         | API / WebSocket                                                            |
| ----------- | ------------------ | --------------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| Development | geen               | lokaal                      | Vite dev server                  | lokale Workers/proxy                                                       |
| Test/Beta   | `staging`          | release uit `main`          | `https://beta.mtgbattlearena.nl` | `https://api.beta.mtgbattlearena.nl` / `https://ws.beta.mtgbattlearena.nl` |
| Production  | `production`       | dezelfde release uit `main` | `https://mtgbattlearena.nl`      | `https://api.mtgbattlearena.nl` / `https://ws.mtgbattlearena.nl`           |

De branch `staging` is niet meer nodig voor CI/CD. De naam `staging` blijft
uitsluitend bestaan als GitHub Environment, Firebase Hosting-target en Wrangler
environment voor Beta.

## Pull request CI

`.github/workflows/ci.yml` draait voor pull requests naar `main` en kan
handmatig worden gestart. Change detection houdt de stabiele checks goedkoop,
maar alle vereiste checknamen blijven altijd zichtbaar:

- `CI / Frontend`
- `CI / Game Worker`
- `CI / Import Worker`
- `CI / Dependency Review`

Geraakte projecten krijgen lint, typecheck, tests, PWA-build en/of Wrangler
dry-run. Dependency Review blokkeert nieuw geïntroduceerde high en critical
kwetsbaarheden. De workflow gebruikt `contents: read`, ontvangt geen deployment
secrets en gebruikt geen `pull_request_target`. CodeQL blijft afzonderlijk door
GitHub beheerd.

## Releaseworkflow

`.github/workflows/deploy-release.yml` start bij iedere push naar `main`. Een
handmatige run is alleen effectief wanneer `main` als ref is geselecteerd. De
workflow gebruikt concurrencygroep `release-main` met annuleren uitgeschakeld,
zodat releases niet racen of een lopende promotie onderbreken.

Handmatig starten: **Actions → Deploy Release → Run workflow → main**. Zo'n run
selecteert bewust alle deployables en doorloopt opnieuw Beta vóór Production.

De jobs zijn:

1. `Release / Detect changes`
2. `Release / Validate`
3. `Release / Build frontend artifact` wanneer de frontend geraakt is
4. Beta-deployments voor geraakte deployables
5. `Beta / Release complete`
6. Production-deployments voor dezelfde geraakte deployables
7. `Production / Release complete`

Iedere Production-job vereist een succesvolle `Beta / Release complete`. Die
aggregatiejob controleert expliciet dat iedere geraakte Beta-deployment is
geslaagd. Een mislukte Firebase-, Import Worker- of Game Worker-deployment laat
de aggregatie falen en slaat Production volledig over.

Wanneer beide Workers geraakt zijn, wordt binnen iedere omgeving eerst de
Import Worker en daarna de Game Worker gedeployed. Hiermee blijft de bestaande
service-bindingvolgorde behouden.

## Build once, deploy many

Vite bouwt één environment-neutrale PWA. De job uploadt `apps/web/dist` als
artifact `frontend-release-<run_number>`. Zowel Beta als Production downloaden
exact dit artifact; de JavaScript- en CSS-bundles worden niet opnieuw gebouwd.

Omgevingswaarden staan in `/runtime-config.js`, buiten de Vite-bundle. De
generator kent geen namen, URLs of Firebaseprojecten: hij leest en valideert
uitsluitend procesvariabelen. GitHub Actions vult die met gedeelde Repository
Variables en waarden uit de actieve GitHub Environment. Daardoor vereist een
derde omgeving geen scriptwijziging. `RELEASE_VERSION` komt in de workflow uit
`github.run_number`; Beta en Production krijgen zo hetzelfde buildnummer.

Het gegenereerde `runtime-config.js` wordt niet door Workbox geprecachet en
krijgt via Firebase `Cache-Control: no-store`. Bij een volledig offline bezoek
mag dit script niet laden; de app-shell start dan nog steeds en de online laag
blijft volgens het local-first principe niet beschikbaar.

De oude `.env.production` en `.env.staging` zijn verwijderd om te voorkomen dat
omgevingendpoints opnieuw in de bundle terechtkomen. `.env.local` blijft voor
lokale ontwikkeling als fallback ondersteund.

## Releaseversie

`github.run_number` is het release-/buildnummer voor de volledige workflow.
Wrangler ontvangt dezelfde waarde als `RELEASE_VERSION` voor beide Workers en
de frontend-runtimeconfig bevat `releaseVersion`.

Na een succesvolle Beta-promotie publiceert een job een GitHub Deployment-record
voor `staging` met task `release-metadata` en beschrijving `Build #X`.
Production publiceert pas na
een volledig succesvolle Production-promotie een record voor
`production` met dezelfde task. Alleen deze twee metadatajobs hebben
`deployments: write`; alle overige jobs houden `contents: read`.

De README-badges lezen het nieuwste record per metadataomgeving. Daardoor kan
Beta `Build #143` tonen terwijl Production na een fout op `Build #142` blijft.
Een mislukte deployment publiceert geen nieuw succesvol releaserecord.

## Firebase Hosting en Authentication

Beta en Production gebruiken hetzelfde Firebaseproject `mtgbattlearena` en
delen bewust Authentication, providers en gebruikers. Hosting blijft door
expliciete targets gescheiden:

| Target       | Site                  | Custom domain            |
| ------------ | --------------------- | ------------------------ |
| `staging`    | `mtgbattlearena-beta` | `beta.mtgbattlearena.nl` |
| `production` | `mtgbattlearena`      | `mtgbattlearena.nl`      |

De Beta-job gebruikt uitsluitend target `staging`; de Production-job uitsluitend
target `production`. Er zijn geen Preview Channels.

Beide GitHub Environments hebben nodig:

| Secret                                    | Inhoud                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT_MTGBATTLEARENA` | Service-account JSON met Hostingrechten in het gedeelde Firebaseproject |
| `CLOUDFLARE_API_TOKEN`                    | Scoped token voor de betreffende Workers en routes                      |
| `CLOUDFLARE_ACCOUNT_ID`                   | Cloudflare-account met de Workers                                       |

Configureer deze niet-geheime GitHub Repository Variables eenmaal voor beide
omgevingen:

| Repository Variable    | Inhoud                               |
| ---------------------- | ------------------------------------ |
| `FIREBASE_API_KEY`     | publieke gedeelde Firebase-webconfig |
| `FIREBASE_AUTH_DOMAIN` | publieke gedeelde Firebase-webconfig |
| `FIREBASE_PROJECT_ID`  | gedeeld Firebaseproject-ID           |
| `FIREBASE_APP_ID`      | publieke gedeelde Firebase-webconfig |

Configureer daarnaast deze GitHub Environment Variables per omgeving:

| Environment Variable | `staging`                            | `production`                    |
| -------------------- | ------------------------------------ | ------------------------------- |
| `APP_ENV`            | `staging`                            | `production`                    |
| `IMPORT_API_URL`     | `https://api.beta.mtgbattlearena.nl` | `https://api.mtgbattlearena.nl` |
| `ONLINE_API_URL`     | `https://api.beta.mtgbattlearena.nl` | `https://api.mtgbattlearena.nl` |
| `ONLINE_SOCKET_URL`  | `https://ws.beta.mtgbattlearena.nl`  | `https://ws.mtgbattlearena.nl`  |

`RELEASE_VERSION` wordt door de workflow gezet op `github.run_number` en
`RUNTIME_CONFIG_OUTPUT` op `apps/web/dist/runtime-config.js`; deze hoeven niet
handmatig als Environment Variable te worden beheerd.

Pas de deployment branch policy van GitHub Environment `staging` aan: alleen
`main` hoeft nog toegestaan te zijn. Doe hetzelfde voor `production`.

## Cloudflare-isolatie

| Component       | Beta                             | Production                           |
| --------------- | -------------------------------- | ------------------------------------ |
| Import Worker   | `mtg-battle-mode-import-staging` | `mtg-battle-mode-import`             |
| Game Worker     | `mtg-battle-mode-online-staging` | `mtg-battle-mode-online`             |
| Wrangler        | `--env staging`                  | standaardconfiguratie zonder `--env` |
| Import binding  | staging Import Worker            | Production Import Worker             |
| Durable Objects | eigen staging namespaces         | Production namespaces                |

Wranglerbindings en migrations blijven expliciet per environment gedefinieerd.
De gedeelde releasebron verandert niets aan de scheiding van Lobby- en
Game-state.

De Cloudflare-token heeft minimaal nodig:

- Account → Workers Scripts → Edit
- Zone → Workers Routes → Edit voor de relevante zone

Gebruik nooit de Global API Key.

## Change detection

- `apps/web/**`, runtimeconfigscript en Firebaseconfiguratie raken de frontend.
- `apps/game-worker/**` raakt de Game Worker.
- `apps/import-worker/**` raakt de Import Worker.
- `packages/**` en root-TypeScriptconfiguratie raken frontend en Game Worker.
- `package.json`, `package-lock.json` en de releaseworkflow raken alle
  deployables.
- Een handmatige release vanaf `main` selecteert alle deployables.

Bij een documentatie-only push wordt geen release gepubliceerd. Zodra minstens
één deployable geraakt is, krijgen Beta en Production na succes hetzelfde
releasebuildnummer, ook als alleen één Worker wijzigde.

## Rulesets

PR’s hoeven alleen naar `main`. Behoud deze vereiste checks:

- `CI / Frontend`
- `CI / Game Worker`
- `CI / Import Worker`
- `CI / Dependency Review`
- `Analyze (javascript-typescript)` voor CodeQL

Deze wijziging voegt geen extra quality gates, approvals, smoke tests,
Playwright-deploymenttests of PR-previewdeployments toe.

## Handmatige inrichting

1. Verwijder `staging` als toegestane deploymentbranch uit de GitHub Environment
   `staging` en sta `main` toe.
2. Controleer dat Environment `production` eveneens alleen `main` toestaat.
3. Plaats de gedeelde Firebasewaarden als Repository Variables en alleen de
   omgevingsspecifieke runtimewaarden in beide Environments.
4. Behoud de bestaande Environment secrets; er zijn geen nieuwe secrets nodig.
5. Controleer dat beide Firebase Hosting-targets en custom domains nog correct
   gekoppeld zijn.
6. Controleer na de eerste release in Cloudflare dat beide Workerparen hetzelfde
   `RELEASE_VERSION` tonen en dat de staging Game Worker uitsluitend aan de
   staging Import Worker bindt.
7. De oude workflows `Deploy Beta` en `Deploy Production` verdwijnen. Pas
   eventuele externe workflow-notificaties aan naar `Deploy Release`.

## Troubleshooting

- **Production is skipped:** open `Beta / Release complete`; minstens één
  vereiste Beta-deployment is niet geslaagd.
- **Runtimeconfig ontbreekt:** controleer zowel de vier Firebase Repository
  Variables als de vier runtime Environment Variables uit de tabellen. De
  generator faalt veilig bij een ontbrekende of ongeldige waarde.
- **Verkeerde endpoint zichtbaar:** controleer `/runtime-config.js` op de
  betreffende site en de `no-store` responseheader.
- **Artifact ontbreekt:** controleer `Release / Build frontend artifact`; Beta en
  Production gebruiken artifactnaam `frontend-release-<run_number>`.
- **Workerrelease verschilt:** controleer `RELEASE_VERSION` in de Wrangler
  deploylog en Workerbindings.
- **Badge loopt achter:** het releaserecord wordt pas gepubliceerd nadat de hele
  betreffende omgeving succesvol is gepromoveerd; Shields kan kort cachen.

Een echte deployment kan lokaal niet veilig worden getest zonder Environment
credentials. Lokale builds, runtimeconfiggeneratie en Wrangler dry-runs
valideren de repositoryconfiguratie zonder externe wijzigingen.
