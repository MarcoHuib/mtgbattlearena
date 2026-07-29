import * as path from "node:path"
import { defineConfig } from "vitest/config"
import packageJson from "./package.json" with { type: "json" }

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: {
      "cloudflare:workers": path.resolve(
        import.meta.dirname,
        "test/cloudflare-workers.ts",
      ),
      "@mtg/game-core": path.resolve(
        import.meta.dirname,
        "../../packages/game-core/src",
      ),
      "@mtg/game-protocol": path.resolve(
        import.meta.dirname,
        "../../packages/game-protocol/src/index.ts",
      ),
    },
  },
  test: {
    name: `${packageJson.name}-game-worker`,
    environment: "node",
    globals: true,
    watch: false,
    include: ["test/**/*.test.ts"],
    typecheck: {
      enabled: true,
      tsconfig: path.join(import.meta.dirname, "tsconfig.test.json"),
    },
  },
})
