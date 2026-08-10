# CI/CD

MTG Battle Arena gebruikt één npm-workspace en één lockfile. Development is
lokaal, `staging` vertegenwoordigt Test/Beta en `main` vertegenwoordigt
Production.

| Omgeving              | Branch    | Frontend                         | API / WebSocket                                                            |
| --------------------- | --------- | -------------------------------- | -------------------------------------------------------------------------- |
| Development           | lokaal    | Vite dev server                  | lokale Workers                                                             |
| Test/Beta (`staging`) | `staging` | `https://beta.mtgbattlearena.nl` | `https://api.beta.mtgbattlearena.nl` / `https://ws.beta.mtgbattlearena.nl` |
| Production            | `main`    | `https://mtgbattlearena.nl`      | `https://api.mtgbattlearena.nl` / `https://ws.mtgbattlearena.nl`           |

Een pull request voert nooit een deployment uit. Een merge/push naar `staging`
start Beta; een merge/push naar `main` start Production.

## Pull request CI

`.github/workflows/ci.yml` draait voor pull requests naar `staging` en `main` en
kan handmatig worden gestart. Change detection bepaalt welke projecten geraakt
zijn. De stabiele checks worden altijd aangemaakt, ook als een project niet is
geraakt:

- `CI / Frontend`
- `CI / Game Worker`
- `CI / Import Worker`
- `CI / Dependency Review`

Geraakte projecten krijgen lint, typecheck, tests, PWA-build en/of Wrangler
dry-run. Dependency Review blokkeert nieuw geïntroduceerde high en critical
kwetsbaarheden. CI gebruikt uitsluitend `contents: read`, krijgt geen deployment
environment en ontvangt geen productie- of stagingcredentials. CodeQL blijft de
bestaande afzonderlijke GitHub-configuratie gebruiken.

## Change detection

- `apps/web/**`, de bijbehorende environmentfile en Firebaseconfiguratie raken
  de frontend.
- `apps/game-worker/**` raakt de Game Worker.
- `apps/import-worker/**` raakt de Import Worker.
- `packages/**` en root-TypeScriptconfiguratie raken frontend en Game Worker.
- `package.json` en `package-lock.json` raken alle deployables.
- Staging-only frontendconfiguratie activeert geen Production Hosting-deploy;
  Production-only frontendconfiguratie activeert geen Beta Hosting-deploy.
- Een gewijzigd Worker-`wrangler.toml` raakt die Worker conservatief in beide
  omgevingen, omdat production- en stagingsecties hetzelfde bestand delen.

## Beta deployment

`.github/workflows/deploy-beta.yml` draait uitsluitend na een push naar
`staging`. Het gebruikt concurrencygroep `staging` met annuleren uitgeschakeld.
`Beta / Validate` heeft geen environment of secrets en valideert alleen geraakte
deployables. Daarna kunnen onafhankelijk draaien:

- `Beta / Firebase Hosting`
- `Beta / Import Worker`
- `Beta / Game Worker`

Als beide Workers veranderen, wacht de Game Worker op de Import Worker. Bij een
Game Worker-only wijziging blokkeert de overgeslagen Import Worker-job niet.

De frontend wordt gebouwd met Vite mode `staging` en `.env.staging`. De drie
service-endpoints zijn daarmee vast op de Beta-hosts gezet. De publieke Firebase
webconfiguratie wordt tijdens de build uit GitHub Environment variables
ingevuld en moet gelijk zijn aan de Production Firebase Auth-configuratie.
`.firebaserc` koppelt target `staging` expliciet aan Hosting-site
`mtgbattlearena-beta`; de workflow deployt alleen dit target binnen het gedeelde
project `mtgbattlearena`. Er worden geen Preview Channels gebruikt.

Cloudflare wordt gedeployed met `wrangler deploy --env staging`:

| Component              | Production (standaardconfiguratie) | Staging environment              |
| ---------------------- | ---------------------------------- | -------------------------------- |
| Import Worker          | `mtg-battle-mode-import`           | `mtg-battle-mode-import-staging` |
| Game Worker            | `mtg-battle-mode-online`           | `mtg-battle-mode-online-staging` |
| Import service binding | Production Import Worker           | Staging Import Worker            |
| Durable Objects        | Production Worker-namespaces       | Eigen staging Worker-namespaces  |

Wrangler erft `vars`, service bindings en Durable Objectconfiguratie niet naar
een named environment. Daarom staan de stagingbindings en migrations expliciet
in `wrangler.toml`. Beide omgevingen gebruiken `FIREBASE_PROJECT_ID =
"mtgbattlearena"` en delen dus Authentication. De bindings zonder `script_name`
verwijzen naar de staging Game Worker zelf en houden Lobby- en Game-state
gescheiden van Production. De
bestaande migrations worden herhaald voor de nieuwe namespaces; er wordt geen
Production-migratie verwijderd of gewijzigd.

## Production deployment

`.github/workflows/deploy-production.yml` blijft verantwoordelijk voor pushes
naar `main` en veilige handmatige runs op `main`. Production gebruikt:

- GitHub Environment `production`;
- Firebaseproject `mtgbattlearena` en expliciet Hosting-target `production`;
- Wrangler zonder `--env`;
- Workers `mtg-battle-mode-import` en `mtg-battle-mode-online`;
- routes `api.mtgbattlearena.nl` en `ws.mtgbattlearena.nl`;
- de bestaande Production service binding en Durable Object-namespaces.

De Productieworkflow is verder niet inhoudelijk gewijzigd. De concurrencygroep
`production`, validation-before-deploy en veilige Worker-volgorde blijven
behouden.

Ook de handmatige npm-scripts zijn target-safe: `npm run deploy:firebase`
gebruikt alleen `hosting:production`; `npm run
deploy:firebase:hosting:staging` gebruikt alleen `hosting:staging`.

## GitHub Environments

### `production`

De bestaande Environment behoudt:

| Secret                                    | Inhoud                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT_MTGBATTLEARENA` | Volledige JSON-key voor de Hosting service account van het gedeelde Firebaseproject |
| `CLOUDFLARE_API_TOKEN`                    | Beperkte Cloudflare deploytoken                                                     |
| `CLOUDFLARE_ACCOUNT_ID`                   | Cloudflare-account met de Production Workers                                        |

Beperk deployment branches tot `main`.

### `staging`

Maak **Settings → Environments → staging** en beperk deployment branches tot
`staging`. Voeg deze Environment secrets toe:

| Secret                                    | Inhoud                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT_MTGBATTLEARENA` | Dezelfde Hosting service-account JSON als voor Production; een tweede account is niet nodig |
| `CLOUDFLARE_API_TOKEN`                    | Beperkte token voor de twee staging Workers en Beta-routes                                  |
| `CLOUDFLARE_ACCOUNT_ID`                   | Cloudflare-account met de staging Workers                                                   |

Voeg daarnaast deze Environment variables toe. Dit zijn publieke configuratie-
waarden, geen private credentials:

| Variable                    | Inhoud                                           |
| --------------------------- | ------------------------------------------------ |
| `VITE_FIREBASE_API_KEY`     | Dezelfde Firebase Web App API key als Production |
| `VITE_FIREBASE_AUTH_DOMAIN` | Dezelfde Firebase Auth domain als Production     |
| `VITE_FIREBASE_PROJECT_ID`  | `mtgbattlearena`, gelijk aan Production          |
| `VITE_FIREBASE_APP_ID`      | Dezelfde Firebase Web App ID als Production      |

De workflow stopt vóór deployment wanneer verplichte waarden ontbreken of de
frontend niet het gedeelde Firebaseproject `mtgbattlearena` gebruikt.

## Externe inrichting

### Firebase Beta

1. Maak binnen Firebaseproject `mtgbattlearena` een tweede Hosting-site met
   site-ID `mtgbattlearena-beta`. De `.firebaserc`-targetmapping verwacht exact
   die site-ID.
2. Koppel `beta.mtgbattlearena.nl` als custom domain aan deze tweede site, niet
   aan de bestaande Production-site.
3. Voeg `beta.mtgbattlearena.nl` toe aan Firebase Authentication → Authorized
   domains. Providers en gebruikers blijven bewust gedeeld met Production.
4. Kopieer de bestaande publieke Production Web App-config naar de vier staging
   Environment variables. Een afzonderlijke Firebase Web App is niet vereist.
5. Kopieer dezelfde service-account JSON naar het gelijknamige secret in de
   GitHub Environment `staging`. Voor Hosting zijn
   `roles/firebasehosting.admin` en `roles/serviceusage.apiKeysViewer` voldoende.
6. Controleer eenmalig met `firebase target:apply hosting staging
mtgbattlearena-beta --project mtgbattlearena` dat de externe targetmapping
   overeenkomt met `.firebaserc`; commit nooit credentialbestanden.

### Cloudflare Beta

1. Zorg dat `api.beta.mtgbattlearena.nl` en `ws.beta.mtgbattlearena.nl` in de
   beheerde zone beschikbaar zijn. Wrangler declareert ze als custom domains;
   controleer na de eerste deployment de DNS/custom-domainstatus.
2. Geef de staging API-token Account → Workers Scripts → Edit en voor alleen de
   relevante zone Zone → Workers Routes → Edit. Gebruik nooit de Global API Key.
3. De eerste stagingdeployment maakt de nieuwe Worker- en Durable
   Object-resources aan. Deploy bij een eerste volledige inrichting eerst de
   Import Worker en daarna de Game Worker; de workflow bewaakt die volgorde.
4. Controleer na deployment dat `mtg-battle-mode-online-staging` via binding
   `IMPORT` uitsluitend naar `mtg-battle-mode-import-staging` verwijst.

## Rulesets

Gebruik voor pull requests naar zowel `staging` als `main` dezelfde stabiele
CI-checks:

- `CI / Frontend`
- `CI / Game Worker`
- `CI / Import Worker`
- `CI / Dependency Review`
- `Analyze (javascript-typescript)` voor de bestaande CodeQL-workflow

Deze slice maakt of wijzigt geen Rulesets en voegt geen nieuwe quality gates,
deployment approvals, smoke tests of PR-previewdeployments toe.

## Troubleshooting

- **CI verschijnt niet:** controleer dat de PR-base `staging` of `main` is.
- **Beta workflow verschijnt niet:** deployment start pas na een push/merge naar
  `staging`, niet tijdens de PR.
- **Beta Firebase configuration ontbreekt:** controleer de staging Environment
  variables en of de Environment branch policy `staging` toestaat.
- **Firebase permission denied:** controleer de service-accountrollen en of de
  JSON-key toegang heeft tot project `mtgbattlearena` en beide Hosting-sites.
- **Verkeerde Firebaseconfig geweigerd:** de stagingvariabele
  `VITE_FIREBASE_PROJECT_ID` moet bewust `mtgbattlearena` zijn.
- **Workerroute faalt:** controleer token-zonebereik, custom domains en Workers
  Routes → Edit.
- **Service binding faalt:** deploy de staging Import Worker eerst en controleer
  de exacte Workernaam.
- **Worker dry-run faalt:** voer lokaal
  `npm run deploy:cloudflare:check:staging` uit; hiervoor zijn geen credentials
  nodig.

Een echte Beta- of Production-deployment kan lokaal niet veilig worden getest
zonder de externe projecten, domains en Environment credentials. Gebruik builds
en beide Wrangler dry-runs om repositoryconfiguratie vóór de eerste deployment
te verifiëren.
