import { defineConfig, devices } from "@playwright/test"
import * as path from "node:path"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      "npm run build && npm run preview --workspace @mtg/web -- --host 127.0.0.1",
    cwd: path.resolve(import.meta.dirname, "../.."),
    env: {
      ...process.env,
      VITE_ONLINE_API_URL: "",
      VITE_ONLINE_SOCKET_URL: "",
    },
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
