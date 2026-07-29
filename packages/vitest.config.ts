import { defineConfig } from "vitest/config"
import packageJson from "../package.json" with { type: "json" }

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: `${packageJson.name}-packages`,
    environment: "node",
    globals: true,
    watch: false,
    include: ["*/src/**/*.test.ts"],
  },
})
