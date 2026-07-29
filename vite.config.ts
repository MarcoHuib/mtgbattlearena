import react from "@vitejs/plugin-react"
import * as path from "node:path"
import { VitePWA } from "vite-plugin-pwa"
import { defineConfig } from "vitest/config"
import packageJson from "./package.json" with { type: "json" }

export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:workers": path.resolve(
        import.meta.dirname,
        "src/test/cloudflare-workers.ts",
      ),
    },
  },
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
              /^https:\/\/(?:api\.scryfall\.com\/cards\/|cards\.scryfall\.io\/|card-images\.archidekt\.com\/).+/i,
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
      "/api/import/archidekt/image": {
        target: "https://card-images.archidekt.com",
        changeOrigin: true,
        rewrite: requestPath => {
          const requestUrl = new URL(requestPath, "http://localhost")
          const match =
            /^\/api\/import\/archidekt\/image\/([0-9a-f-]{36})$/i.exec(
              requestUrl.pathname,
            )
          const cardId = match?.[1] ?? ""
          const face =
            requestUrl.searchParams.get("face") === "back" ? "back" : "front"
          const hash = requestUrl.searchParams.get("hash") ?? ""
          return `/normal/${face}/${cardId[0] ?? ""}/${cardId[1] ?? ""}/${cardId}.jpg?${encodeURIComponent(hash)}`
        },
      },
      "/api/import/archidekt/tokens": {
        target: "https://archidekt.com",
        changeOrigin: true,
        rewrite: requestPath => {
          const requestUrl = new URL(requestPath, "http://localhost")
          const ids = requestUrl.searchParams.get("ids") ?? ""
          return `/api/cards/v2/?oracleCardIds=${encodeURIComponent(ids)}&includeTokens&unique`
        },
      },
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
