import react from "@vitejs/plugin-react"
import * as path from "node:path"
import { VitePWA } from "vite-plugin-pwa"
import { defineConfig } from "vitest/config"
import packageJson from "./package.json" with { type: "json" }

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["app-icon.svg", "magic-card-back.webp"],
      manifest: {
        name: "MTG Battle Mode",
        short_name: "Battle Mode",
        description: "Een local-first digitale tafel voor twee Magic-decks.",
        theme_color: "#07110e",
        background_color: "#07110e",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/app-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern:
              /^https:\/\/(?:api\.scryfall\.com\/cards\/|cards\.scryfall\.io\/).+/i,
            handler: "CacheFirst",
            options: {
              cacheName: "mtg-battle-runtime-images-v1",
              expiration: {
                maxEntries: 800,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],

  server: {
    open: true,
    proxy: {
      "/api/import/archidekt": {
        target: "https://archidekt.com",
        changeOrigin: true,
        rewrite: path =>
          path.replace(/^\/api\/import\/archidekt\/(\d+)$/, "/api/decks/$1/"),
      },
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": [
            "react",
            "react-dom",
            "react-redux",
            "@reduxjs/toolkit",
          ],
          "interaction-vendor": ["@dnd-kit/react"],
          "data-vendor": ["dexie", "zod"],
        },
      },
    },
  },

  test: {
    root: import.meta.dirname,
    name: packageJson.name,
    environment: "jsdom",

    typecheck: {
      enabled: true,
      tsconfig: path.join(import.meta.dirname, "tsconfig.json"),
    },

    globals: true,
    watch: false,
    setupFiles: ["./src/setupTests.ts"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
})
