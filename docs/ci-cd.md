# CI/CD

This repository uses two GitHub Actions workflows. All npm commands run from
the repository root because the web app, Workers, and shared packages belong to
one npm workspace with one lockfile.

## Pull request CI

`.github/workflows/ci.yml` runs for pull requests targeting `main` and can also
be started manually. It never receives production credentials and never
deploys. Its first job compares the pull request base and head commits and maps
changed files to the affected deployables. A manual CI run validates all three.
The stable pull request checks are always created, including when their project
is unaffected:

- `CI / Frontend` — when affected, installs with `npm ci`, lints, type-checks the
  frontend and shared packages, runs their tests, and builds the production PWA.
- `CI / Game Worker` — lints, type-checks, and tests the game Worker, then runs a
  Wrangler dry-run deployment when affected.
- `CI / Import Worker` — lints and runs a Wrangler dry-run deployment. This
  JavaScript Worker currently has no dedicated type-check or test suite. These
  operations run only when it is affected.
- `CI / Dependency Review` — rejects newly introduced high or critical
  vulnerabilities. It runs only for pull requests because dependency review is
  based on the pull request's base/head comparison.

CodeQL remains separately managed by GitHub and is not duplicated here.
Unaffected project checks execute only a successful explanatory step. If change
detection itself fails, all three project checks fail instead of being skipped,
so required Ruleset checks cannot silently pass.

The change mapping is:

- `apps/web/**`, `firebase.json`, `.firebaserc`: frontend.
- `apps/game-worker/**`: game Worker.
- `apps/import-worker/**`: import Worker.
- `packages/**` and root TypeScript configuration: frontend and game Worker.
- Root `package.json` or `package-lock.json`: all three deployables.
- Root ESLint or workflow changes: all three CI validations, but by themselves
  they do not trigger a production deployment.

## Production deployment

`.github/workflows/deploy-production.yml` runs after a push reaches `main`. A
manual run is also available. Its change-detection job only runs when the
selected ref is `main`, and a manual run intentionally selects all deployables.
For a push, the workflow compares the push's before/after commits. The workflow
uses a `production` concurrency group with cancellation disabled, so production
deployments cannot race or interrupt one another.

`Production / Validate` checks out the exact `main` commit, installs with
`npm ci`, and runs only the affected projects' type-check, tests, production PWA
build, and/or Worker dry-run bundle. It does not reuse a pull request artifact.
If no deployable changed, validation and all deployments are skipped.

After validation:

- `Production / Firebase Hosting` rebuilds the PWA and deploys the `live`
  Hosting channel using `firebase.json` and `.firebaserc`. The configured output
  directory is `apps/web/dist` and the configured project/site is
  `mtgbattlearena`.
- `Production / Import Worker` deploys `apps/import-worker/wrangler.toml` only
  when that Worker is affected.
- `Production / Game Worker` deploys `apps/game-worker/wrangler.toml` only when
  that Worker is affected. When both Workers changed, it waits for the import
  Worker because the game Worker has a service binding to it. For a game-only
  change, the skipped import deployment does not block it.

The three deployment jobs use the GitHub Environment `production`. The
validation job has no access to that environment or its secrets.

## GitHub Environment and secrets

Create **Settings → Environments → production**. Store these secrets on that
environment rather than as repository-wide secrets:

| Secret                                    | Contents                                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT_MTGBATTLEARENA` | The complete JSON key for a dedicated Firebase/GCP deployment service account in project `mtgbattlearena`. |
| `CLOUDFLARE_API_TOKEN`                    | A scoped Cloudflare API token; never use the Global API Key.                                               |
| `CLOUDFLARE_ACCOUNT_ID`                   | The Cloudflare account ID containing both Workers.                                                         |

Recommended environment protection:

- Restrict deployment branches/tags to `main` only.
- Add required reviewers if production should require a human approval.
- Prevent administrators from bypassing protection where organizational policy
  requires it.

### Firebase service account

Create a dedicated service account for GitHub Actions and add a JSON key as the
environment secret above. For this repository's static live-channel deployment,
grant only:

- Firebase Hosting Admin (`roles/firebasehosting.admin`).
- API Keys Viewer (`roles/serviceusage.apiKeysViewer`), required by Firebase CLI
  deployments.

This workflow does not deploy preview channels and `firebase.json` has no Cloud
Run or Cloud Functions rewrites, so Firebase Authentication Admin and Cloud Run
Viewer are not required. Do not commit the downloaded JSON key. Rotate it
periodically and immediately if exposure is suspected.

### Cloudflare API token

Create a custom API token scoped to the Cloudflare account that contains
`mtg-battle-mode-import` and `mtg-battle-mode-online`. It needs:

- Account → Workers Scripts → Edit, to upload both Workers and apply Durable
  Object migrations.
- Zone → Workers Routes → Edit for only the zone used by
  `api.mtgbattlearena.nl` and `ws.mtgbattlearena.nl`, because the game Worker
  declares custom-domain routes.

Do not grant unrelated DNS, billing, user-management, or Global API Key access.
If Cloudflare reports account-discovery permission is required despite supplying
`CLOUDFLARE_ACCOUNT_ID`, add Account Settings → Read rather than broadening the
token further.

## Main Ruleset quality gates

After the pull request workflow has completed successfully at least once, add
these exact status checks under **Settings → Rules → Rulesets → Protect main →
Require status checks to pass**:

- `CI / Frontend`
- `CI / Game Worker`
- `CI / Import Worker`
- `CI / Dependency Review`
- `Analyze (javascript-typescript)`

`Analyze (javascript-typescript)` is the exact existing CodeQL check name
confirmed from a completed run in this repository. In the Ruleset's code
scanning protection, also keep CodeQL configured to block merges for high and
critical findings; the status check ensures analysis completed, while the code
scanning rule enforces the finding threshold.

Enable **Require branches to be up to date before merging**. This makes every
required check evaluate the candidate commit together with the latest `main`,
reducing the chance that individually valid pull requests break after merge.

## Manual production deployment

1. Open **Actions → Deploy Production → Run workflow**.
2. Select the `main` branch. Any other selected ref causes validation to skip,
   which prevents every deployment job from running.
3. Start the workflow. Manual runs validate and deploy all three projects; if
   configured, approve each `production` environment deployment.

Never use a feature branch manual run as a production deployment mechanism.

## Troubleshooting

- **`npm ci` fails:** confirm `package.json` and `package-lock.json` were updated
  together and that the workflow is running from the repository root.
- **PWA build fails:** run `npm run build` locally and inspect Vite's generated
  `apps/web/dist/manifest.webmanifest`, `sw.js`, and Workbox bundle.
- **Worker dry-run fails:** run `npm run deploy:cloudflare:check` locally. No
  Cloudflare credentials are needed for a dry run.
- **Firebase authentication fails:** confirm the full service-account JSON is in
  the correctly named `production` environment secret and that its project is
  `mtgbattlearena`.
- **Firebase permission denied:** verify the two Firebase roles above and inspect
  the denied permission before adding any role.
- **Cloudflare account not found:** verify `CLOUDFLARE_ACCOUNT_ID`, token account
  scope, and whether Account Settings → Read is required.
- **Cloudflare route deployment fails:** verify Workers Routes → Edit is scoped
  to the production zone and Workers Scripts → Edit is scoped to the correct
  account.
- **Deployment waits indefinitely:** inspect `production` environment reviewer
  and branch protection settings.

Production deployment itself cannot be tested without the environment secrets.
Use the Wrangler dry runs and local PWA build to validate configuration before
the first main deployment.
