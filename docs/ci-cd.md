# CI/CD

## Public documentation boundary for private provider integrations

De publieke pipeline-documentatie beschrijft bewust niet hoe vertrouwelijke
provideraccess technisch is opgeslagen, benoemd of gekoppeld. Niet-openbare
provideradapters en hun operationele configuratie vallen buiten deze repository.

CI/CD mag geen providercredentials, private providerfixtures, raw responses of
interne providerdetails in logs, artifacts, source maps of clientbundles
publiceren. De exacte productieconfiguratie wordt in private operationele
documentatie beheerd.

De publieke repository blijft zelfstandig buildbaar zonder private providerpackage
of projectspecifieke providercredential. Pull-request-CI en forks krijgen geen
private provideraccess. Een trusted officiële release mag later een private
server-side adapter koppelen, maar dat mag de standaard `npm ci`, lint, typecheck,
tests of build niet afhankelijk maken van private registrytoegang.

Gevoelige runtimecredentials horen in de server-side secret store van de Worker.
Wanneer GitHub Actions een secret moet provisionen, komt de waarde uitsluitend uit
een GitHub Secret/Environment Secret, nooit uit een gewone Repository Variable, en
mag de workflow de waarde niet naar stdout, artifacts of gegenereerde clientconfig
schrijven.


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
                              Production approval
                                      │
                                      ▼
                         Production · Build #X
```

| Omgeving    | GitHub Environment | Frontend                         | API / WebSocket                                                            | Card CDN |
| ----------- | ------------------ | -------------------------------- | -------------------------------------------------------------------------- | -------- |
| Development | geen               | Vite dev server                  | lokale Workers/proxy                                                       | `https://cdn.mtgbattlearena.nl` voor echte kaartassets |
| Beta        | `staging`          | `https://beta.mtgbattlearena.nl` | `https://api.beta.mtgbattlearena.nl` / `https://ws.beta.mtgbattlearena.nl` | publieke CDN blijft `https://cdn.mtgbattlearena.nl`; staging Image Worker heeft geen publieke route |
| Production  | `production`       | `https://mtgbattlearena.nl`      | `https://api.mtgbattlearena.nl` / `https://ws.mtgbattlearena.nl`           | `https://cdn.mtgbattlearena.nl` |

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
- `CI / Image Worker`
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

De workflow heeft vier change-aware componentlijnen:

| Fase       | Frontend                | Game Worker                | Import Worker                | Image Worker                |
| ---------- | ----------------------- | -------------------------- | ---------------------------- | --------------------------- |
| Build      | `Build / Frontend`      | `Build / Game Worker`      | `Build / Import Worker`      | `Build / Image Worker`      |
| Beta       | `Beta / Frontend`       | `Beta / Game Worker`       | `Beta / Import Worker`       | `Beta / Image Worker`       |
| Production | `Production / Frontend` | `Production / Game Worker` | `Production / Import Worker` | `Production / Image Worker` |

`Build / Complete` vereist alle vier buildresultaten. Iedere Production-job
vereist vervolgens een succesvolle `Beta / Complete`. Die aggregatiejob
controleert expliciet dat iedere geraakte Beta-deployment is geslaagd. Een
mislukte Frontend-, Import Worker-, Image Worker- of Game Worker-deployment laat
de aggregatie falen en voorkomt dat Production beschikbaar wordt.

Alle vier Production-releasejobs zijn gekoppeld aan GitHub Environment
`production`. Met Required reviewers geconfigureerd toont GitHub na succesvolle
Beta-promotie de ingebouwde wachtstatus voor approval. Er staat bewust geen
zelfgebouwd approvalmechanisme in YAML of scripts.

Wanneer Import Worker en Game Worker beide geraakt zijn, wordt binnen iedere
omgeving eerst de Import Worker en daarna de Game Worker gedeployed. Hiermee
blijft de Service Binding-volgorde behouden. De Image Worker heeft geen binding
naar de Game/Import Worker en kan als zelfstandige componentlijn promoveren.

## Build once, deploy many

Vite bouwt in `Build / Frontend` één environment-neutrale PWA. De job uploadt
`apps/web/dist` als artifact `frontend-release-<run_number>`. Zowel Beta als
Production downloaden exact dit artifact; de JavaScript- en CSS-bundles worden
niet opnieuw gebouwd.

De Worker-buildjobs voeren lint, typecheck/tests waar beschikbaar en Wrangler
dry-runs voor Beta en Production uit. Wrangler bundelt tijdens de daadwerkelijke
deployment opnieuw; hiervoor wordt bewust geen complex Workerartifact gebouwd.
Broncommit en `RELEASE_VERSION` blijven wel identiek voor iedere fase.

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
Frontend, Game Worker en Import Worker gebruiken dit als `releaseVersion`/
`RELEASE_VERSION`. De Image Worker wordt uit exact dezelfde commit en promotie
uitgerold, maar heeft momenteel geen runtime-`RELEASE_VERSION`-variabele nodig.

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
| `FIREBASE_PROJECT_ID`  | gedeeld Firebaseproject-ID           |
| `FIREBASE_MEASUREMENT_ID` | publieke Analytics measurement-ID |

Configureer daarnaast deze GitHub Environment Variables per omgeving:

| Environment Variable  | `staging`                            | `production`                    |
| -------------------- | ------------------------------------ | ------------------------------- |
| `APP_ENV`            | `staging`                            | `production`                    |
| `IMPORT_API_URL`     | `https://api.beta.mtgbattlearena.nl` | `https://api.mtgbattlearena.nl` |
| `ONLINE_API_URL`     | `https://api.beta.mtgbattlearena.nl` | `https://api.mtgbattlearena.nl` |
| `ONLINE_SOCKET_URL`  | `https://ws.beta.mtgbattlearena.nl`  | `https://ws.mtgbattlearena.nl`  |
| `FIREBASE_AUTH_DOMAIN` | `beta.mtgbattlearena.nl`           | `mtgbattlearena.nl`             |
| `FIREBASE_APP_ID` | afzonderlijke publieke beta Web App-ID | publieke productie Web App-ID |
| `FIREBASE_APP_CHECK_RECAPTCHA_ENTERPRISE_SITE_KEY` | publieke beta Enterprise-sitekey | publieke productie Enterprise-sitekey |
| `FIREBASE_PROJECT_NUMBER` | numeriek Firebase-projectnummer | numeriek Firebase-projectnummer |
| `FIREBASE_ALLOWED_APP_IDS` | uitsluitend beta App-ID(s) | uitsluitend productie App-ID(s) |
| `APP_CHECK_ENFORCEMENT` | `enforce` | eerst `monitor`, na observatie `enforce` |

`RELEASE_VERSION` wordt door de workflow gezet op `github.run_number` en
`RUNTIME_CONFIG_OUTPUT` op `apps/web/dist/runtime-config.js`; deze hoeven niet
handmatig als Environment Variable te worden beheerd.

Pas de deployment branch policy van GitHub Environment `staging` aan: alleen
`main` hoeft nog toegestaan te zijn. Doe hetzelfde voor `production`.

### Gepland in Feature 1 — Firestore Deck Library

ADR 016 voegt Firestore toe voor duurzame clouddecks. Implementeer dit niet als
een verborgen handmatige consolewijziging. Wanneer Feature 1 wordt uitgevoerd:

- voeg Firestore Security Rules als versiebeheerbaar bestand aan de repository toe;
- voeg alleen noodzakelijke Firestore indexes/configuratie toe;
- test Rules in CI/emulator voordat deployment mogelijk is;
- deploy Rules/config via dezelfde Beta → Production-promotie als de code die
erop vertrouwt;
- activeer App Check voor directe Firestore webreads pas nadat Beta bewezen werkt;
- houd Firestore-data zelf buiten build artifacts en CI-fixtures.

Runtime serverwrites naar Firestore mogen niet de bestaande Firebase Hosting-
deploymentcredential hergebruiken alleen omdat die al beschikbaar is. Kies een
afzonderlijke least-privilege servercredential/IAM-identiteit wanneer server-IAM
nodig is en bewaar die uitsluitend als Cloudflare runtime secret. Als GitHub
Actions die credential provisiont, mag de waarde alleen uit een protected GitHub
Environment Secret komen en nooit in runtime-config of logs terechtkomen.

De webapp krijgt geen service-accountcredential. Directe webtoegang gebruikt
Firebase Authentication + Security Rules + App Check en is in het doelmodel
read-only voor authoritative clouddeckrecords.

## Cloudflare-isolatie

| Component       | Beta                                  | Production                            |
| --------------- | ------------------------------------- | ------------------------------------- |
| Import Worker   | `mtg-battle-mode-import-staging`      | `mtg-battle-mode-import`              |
| Game Worker     | `mtg-battle-mode-online-staging`      | `mtg-battle-mode-online`              |
| Image Worker    | `mtg-battle-mode-images-staging`      | `mtg-battle-mode-images`              |
| Image route     | geen publieke route / preview-URL     | `cdn.mtgbattlearena.nl` custom domain |
| Wrangler        | `--env staging`                       | top-levelconfiguratie                 |
| Import binding  | staging Import Worker                 | Production Import Worker              |
| Durable Objects | eigen staging namespaces              | Production namespaces                 |

De Import Workers hebben in beide omgevingen expliciet `workers_dev = false`
en `preview_urls = false`. Zij hebben dus geen publiek `workers.dev`- of
preview-adres en geen eigen publieke route. Alleen de bijbehorende Game Worker
kan ze via de Cloudflare Service Binding `IMPORT` bereiken. De browser gebruikt
voor import de publieke Game Worker-origin uit `IMPORT_API_URL`; CORS op de
Import Worker blijft defense-in-depth en is geen authenticatiemechanisme.

De Image Worker is juist de publieke assetgrens. Production heeft het custom
domain `cdn.mtgbattlearena.nl` en Workers Caching vóór Worker-executie; staging
heeft `workers_dev = false`, `preview_urls = false`, geen route en caching uit.
De frontend gebruikt provider-neutrale ImageRef-URL's naar de publieke CDN en
kent geen deckprovider-upstreamdetails; image-upstreamdetails blijven beperkt tot
de afzonderlijke imagegrens.

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
- `apps/image-worker/**` raakt de Image Worker.
- `packages/**` en root-TypeScriptconfiguratie raken frontend, Game Worker,
  Import Worker en Image Worker.
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
- `CI / Image Worker`
- `CI / Dependency Review`
- `Analyze (javascript-typescript)` voor CodeQL

Deze wijziging voegt geen extra quality gates, smoke tests,
Playwright-deploymenttests of PR-previewdeployments toe. Productionapproval
gebruikt uitsluitend de bestaande GitHub Environment-protection.

## Handmatige inrichting

1. Verwijder `staging` als toegestane deploymentbranch uit de GitHub Environment
   `staging` en sta `main` toe.
2. Controleer dat Environment `production` eveneens alleen `main` toestaat.
3. Configureer onder Environment `production` bij **Deployment protection
   rules** één of meer **Required reviewers**.
4. Plaats de gedeelde Firebasewaarden als Repository Variables en de
   omgevingsspecifieke runtimewaarden, inclusief `FIREBASE_AUTH_DOMAIN` en de
   App Check-waarden, in
   Environments `staging` en `production`.
5. Behoud de bestaande Environment secrets; er zijn geen nieuwe secrets nodig.
6. Controleer dat beide Firebase Hosting-targets en custom domains nog correct
   gekoppeld zijn.
7. Controleer na de eerste release in Cloudflare dat de staging Game Worker
   uitsluitend aan de staging Import Worker bindt, dat de Production Image
   Worker aan `cdn.mtgbattlearena.nl` hangt en dat de staging Image Worker geen
   publieke route heeft.
8. De oude workflows `Deploy Beta` en `Deploy Production` verdwijnen. Pas
   eventuele externe workflow-notificaties aan naar `Deploy Release`.

## Troubleshooting

- **Production is skipped:** open `Beta / Complete`; minstens één
  vereiste Beta-deployment is niet geslaagd.
- **Runtimeconfig ontbreekt:** controleer zowel de vier Firebase Repository
  Variables als de runtime Environment Variables uit de tabellen. De
  generator faalt veilig bij een ontbrekende of ongeldige waarde.
- **Verkeerde endpoint zichtbaar:** controleer `/runtime-config.js` op de
  betreffende site en de `no-store` responseheader.
- **Artifact ontbreekt:** controleer `Build / Frontend`; Beta en
  Production gebruiken artifactnaam `frontend-release-<run_number>`.
- **Workerrelease verschilt:** controleer `RELEASE_VERSION` voor Game/Import,
  de commit/deployrun voor de Image Worker en de bijbehorende Workerbindings/routes.
- **CDN geeft 502:** tail de Image Worker en controleer de veilige upstream-
  diagnostics. De Scryfall-fetch gebruikt handmatige allowlisted redirects en
  een wrapper rond de globale Cloudflare `fetch` om `Illegal invocation` door
  een verkeerde `this`-binding te voorkomen.
- **Badge loopt achter:** het releaserecord wordt pas gepubliceerd nadat de hele
  betreffende omgeving succesvol is gepromoveerd; Shields kan kort cachen.

Een echte deployment kan lokaal niet veilig worden getest zonder Environment
credentials. Lokale builds, runtimeconfiggeneratie en Wrangler dry-runs
valideren de repositoryconfiguratie zonder externe wijzigingen.
