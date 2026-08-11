import type { CodegenConfig } from "@graphql-codegen/cli"
import { typeDefs } from "./apps/game-worker/src/graphql/schema"

const config: CodegenConfig = {
  schema: typeDefs,
  documents: ["apps/web/src/app/api/**/*.graphql"],
  generates: {
    "apps/web/src/app/api/schemaTypes.ts": {
      plugins: ["typescript"],
      config: { scalars: { JSON: "unknown" } },
    },
    "apps/web/src/app/api/graphqlTypes.ts": {
      plugins: ["typescript-operations"],
      config: {
        scalars: { JSON: "unknown" },
        preResolveTypes: false,
        importSchemaTypesFrom: "apps/web/src/app/api/schemaTypes",
        namespacedImportName: "Schema",
      },
    },
    "apps/web/src/app/api/generated.ts": {
      plugins: [
        { add: { content: "import * as Types from './graphqlTypes'" } },
        "typescript-rtk-query",
      ],
      config: {
        importBaseApiFrom: "./graphqlApi",
        importBaseApiAlternateName: "graphqlApi",
        exportHooks: true,
        importOperationTypesFrom: "Types",
        scalars: { JSON: "unknown" },
      },
    },
  },
}

export default config
