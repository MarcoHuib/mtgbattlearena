import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
// The Worker source is TypeScript. Supported CI/runtime Node versions strip
// erasable TypeScript syntax when importing this module for configuration tests.
import importWorker from "../src/index.ts"

const rootUrl = new URL("../../../", import.meta.url)
const read = path => readFile(new URL(path, rootUrl), "utf8")

const [importConfig, gameConfig, endpoints, releaseWorkflow] =
  await Promise.all([
    read("apps/import-worker/wrangler.toml"),
    read("apps/game-worker/wrangler.toml"),
    read("apps/web/src/archidekt/endpoints.ts"),
    read(".github/workflows/deploy-release.yml"),
  ])

const [productionImportConfig, stagingImportConfig = ""] =
  importConfig.split("[env.staging]")

for (const [environment, config] of [
  ["production", productionImportConfig],
  ["staging", stagingImportConfig],
]) {
  assert.match(
    config,
    /^workers_dev\s*=\s*false$/m,
    `${environment} must disable workers.dev`,
  )
  assert.match(
    config,
    /^preview_urls\s*=\s*false$/m,
    `${environment} must disable preview URLs`,
  )
}

assert.match(
  gameConfig,
  /\[\[services\]\][\s\S]*?binding\s*=\s*"IMPORT"[\s\S]*?service\s*=\s*"mtg-battle-mode-import"/,
  "production Game Worker must bind to the production Import Worker",
)
assert.match(
  gameConfig,
  /\[\[env\.staging\.services\]\][\s\S]*?binding\s*=\s*"IMPORT"[\s\S]*?service\s*=\s*"mtg-battle-mode-import-staging"/,
  "staging Game Worker must bind to the staging Import Worker",
)

assert.doesNotMatch(
  endpoints,
  /(?:mtg-battle-mode-import|workers\.dev)/,
  "frontend endpoints must not address the private Import Worker directly",
)
assert.match(
  releaseWorkflow,
  /command: deploy --env staging --config wrangler\.toml/,
  "beta must deploy the staging Import Worker configuration",
)
assert.match(
  releaseWorkflow,
  /command: deploy --env="" --config wrangler\.toml/,
  "production must deploy the production Import Worker configuration",
)

const env = { ALLOWED_ORIGIN: "https://mtgbattlearena.nl" }
const context = {
  waitUntil() {
    return undefined
  },
}
const rejectedMethod = await importWorker.fetch(
  new Request("https://internal/api/import/archidekt/1", {
    method: "POST",
  }),
  env,
  context,
)
assert.equal(rejectedMethod.status, 405)
assert.equal(rejectedMethod.headers.get("Allow"), "GET, OPTIONS")

const preflight = await importWorker.fetch(
  new Request("https://internal/api/import/archidekt/1", {
    method: "OPTIONS",
    headers: { Origin: "https://mtgbattlearena.nl" },
  }),
  env,
  context,
)
assert.equal(preflight.status, 204)
assert.equal(
  preflight.headers.get("Access-Control-Allow-Methods"),
  "GET, OPTIONS",
)

console.log(
  "Private Import Worker configuration is valid for staging and production.",
)
