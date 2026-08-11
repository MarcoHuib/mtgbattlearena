import react from "@vitejs/plugin-react"
import * as path from "node:path"
import { VitePWA } from "vite-plugin-pwa"
import { defineConfig } from "vitest/config"
import packageJson from "./package.json" with { type: "json" }
import {
  firebaseReservedNavigationDenylist,
  oauthPopupSecurityHeaders,
} from "./src/securityHeaders"

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: {
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
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "app-icon.svg",
        "favicon.ico",
        "favicon-16x16.png",
        "favicon-32x32.png",
        "apple-touch-icon.png",
        "android-chrome-192x192.png",
        "android-chrome-512x512.png",
        "site.webmanifest",
        "fantasy-arena-hero.jpg",
        "magic-card-back.webp",
      ],
      manifest: false,
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: firebaseReservedNavigationDenylist,
        globIgnores: ["**/runtime-config.js"],
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
    headers: oauthPopupSecurityHeaders,
    proxy: {
      "/api/online": {
        target: "https://api.mtgbattlearena.nl",
        changeOrigin: true,
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

  preview: {
    headers: oauthPopupSecurityHeaders,
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
      tsconfig: path.join(import.meta.dirname, "tsconfig.app.json"),
    },

    globals: true,
    watch: false,
    setupFiles: ["./src/setupTests.ts"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
})
