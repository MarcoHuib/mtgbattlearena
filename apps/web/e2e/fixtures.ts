import { expect, test as base, type Page } from "@playwright/test"

const test = base.extend({
  page: async ({ page }, provide) => {
    await page.route("**/runtime-config.js", route => {
      const origin = new URL(route.request().url()).origin
      return route.fulfill({
        contentType: "application/javascript",
        body: `window.__MTG_RUNTIME_CONFIG__ = Object.freeze(${JSON.stringify({ onlineApiUrl: origin })})`,
      })
    })
    await provide(page)
  },
})

export { expect, test, type Page }
