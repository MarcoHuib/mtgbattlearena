import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const files = [
  "apps/game-worker/src/graphql/persistedOperations.generated.ts",
  "apps/web/src/app/api/generated.ts",
  "apps/web/src/app/api/graphqlTypes.ts",
  "apps/web/src/app/api/schemaTypes.ts",
  "apps/web/src/app/api/persistedOperationIds.generated.ts",
]

const digest = () =>
  createHash("sha256")
    .update(files.map(file => readFileSync(file)).join("\0"))
    .digest("hex")

const before = digest()
execFileSync("npm", ["run", "graphql:codegen"], { stdio: "inherit" })
if (digest() !== before) {
  console.error(
    "GraphQL-codegenoutput was niet actueel. Commit de opnieuw gegenereerde bestanden.",
  )
  process.exitCode = 1
}
