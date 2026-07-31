import { expect, test, type Page } from "@playwright/test"
import { archidektFixture } from "../src/archidekt/fixtures"

const mockImports = async (page: Page) => {
  await page.route("**/api/import/archidekt/**", async route => {
    const deckId = new URL(route.request().url()).pathname.split("/").at(-1)
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...structuredClone(archidektFixture),
        name: `Deck ${deckId}`,
      }),
    })
  })
}

const configurePlayers = async (page: Page, count: number) => {
  await page.goto("/")
  await page.getByRole("link", { name: /Offline spelen/ }).click()
  for (let number = 3; number <= count; number += 1) {
    await page.getByRole("button", { name: "Speler toevoegen" }).click()
  }
  const slots = page.locator(".deck-slot")
  await expect(slots).toHaveCount(count)
  for (let index = 0; index < count; index += 1) {
    const slot = slots.nth(index)
    await slot
      .getByLabel("Openbare Archidekt-URL")
      .fill(`https://archidekt.com/decks/${index + 101}/deck`)
    await slot.getByRole("button", { name: "Deck importeren" }).click()
    await expect(slot.getByText(`Deck ${index + 101}`)).toBeVisible()
  }
}

const finishFirstPlayerRoll = async (page: Page) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const start = page.getByRole("button", { name: "Start wedstrijd" })
    if (await start.isVisible().catch(() => false)) {
      await start.click()
      return
    }
    await page
      .getByRole("button", {
        name: /Laat (iedereen|tied spelers) .*gooien/,
      })
      .click()
    await expect(
      page.getByRole("button", {
        name: /Start wedstrijd|Laat (iedereen|tied spelers) .*gooien/,
      }),
    ).toBeVisible()
  }
  throw new Error("De dobbelsteenflow leverde geen winnaar op.")
}

const keepAllOpeningHands = async (page: Page, count: number) => {
  for (let index = 0; index < count; index += 1) {
    const dialog = page.getByRole("dialog")
    await expect(dialog.locator(".card")).toHaveCount(7)
    await dialog.getByRole("button", { name: "Deze hand houden" }).click()
  }
}

test("voegt een derde offline speler toe en verwijdert die weer", async ({
  page,
}) => {
  await page.goto("/")
  await page.getByRole("link", { name: /Offline spelen/ }).click()
  await page.getByRole("button", { name: "Speler toevoegen" }).click()
  await expect(page.locator(".deck-slot")).toHaveCount(3)
  await page.getByRole("button", { name: "Speler 3 verwijderen" }).click()
  await expect(page.locator(".deck-slot")).toHaveCount(2)
  await expect(
    page.getByRole("button", { name: "Speler 1 verwijderen" }),
  ).toHaveCount(0)
})

for (const playerCount of [3, 4, 6]) {
  test(`start een echte offline wedstrijd met ${playerCount} spelers`, async ({
    page,
  }) => {
    await mockImports(page)
    await configurePlayers(page, playerCount)
    if (playerCount === 6) {
      await expect(
        page.getByRole("button", { name: "Speler toevoegen" }),
      ).toBeDisabled()
    }

    await page.getByRole("button", { name: "Battle starten" }).click()
    await expect(page.locator(".dice-player")).toHaveCount(playerCount)
    await finishFirstPlayerRoll(page)
    await keepAllOpeningHands(page, playerCount)
    await expect(page.locator(".player-board")).toHaveCount(playerCount)
    await expect(page.getByLabel(/^Speelveld van Deck /)).toHaveCount(
      playerCount,
    )
    const horizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )
    expect(horizontalOverflow).toBeLessThanOrEqual(20)

    await expect(page.getByText(/Lokaal opgeslagen/)).toBeVisible()
    await page.reload()
    await expect(page.locator(".player-board")).toHaveCount(playerCount)
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })
}
