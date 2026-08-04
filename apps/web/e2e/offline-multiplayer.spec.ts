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

for (const playerCount of [2, 3, 4, 5, 6]) {
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
    for (let index = 0; index < playerCount; index += 1) {
      const row = index % 2 === 0 ? "top" : "bottom"
      const column = Math.floor(index / 2)
      const seat = page.locator(
        `[data-seat-row="${row}"][data-seat-column="${column}"]`,
      )
      await expect(seat).toHaveAttribute(
        "data-seat-player",
        `player-${index + 1}`,
      )
    }
    if (playerCount % 2 === 1) {
      await expect(
        page.locator(
          `[data-seat-row="bottom"][data-seat-column="${Math.floor(playerCount / 2)}"]`,
        ),
      ).toHaveAttribute("data-seat-player", "")
    }

    const camera = page.getByTestId("table-camera")
    const centerBar = page.getByTestId("table-center-bar")
    const centerControls = page.getByTestId("table-center-controls")
    await expect(centerBar).toHaveCount(1)
    if (playerCount >= 4) {
      const firstSeat = page.locator('[data-seat-player="player-1"]')
      const secondSeat = page.locator('[data-seat-player="player-2"]')
      const horizontalTargets = [
        firstSeat.locator(".zone--battlefield"),
        secondSeat.locator(".zone--battlefield"),
        firstSeat.locator(".zone--battlefield .zone__empty"),
        firstSeat.locator(".zone--hand"),
        centerControls,
      ]
      const localElements = page.locator(
        ".table-layout__seat, .player-board, .player-board .zone, .player-board .zone__cards",
      )
      for (const target of horizontalTargets) {
        await camera.evaluate(element => {
          element.scrollLeft = 0
        })
        await localElements.evaluateAll(elements => {
          elements.forEach(element => {
            element.scrollLeft = 0
          })
        })
        const boardTransformsBefore = await page
          .locator(".player-board")
          .evaluateAll(elements =>
            elements.map(element => getComputedStyle(element).transform),
          )
        await target.hover()
        await page.mouse.wheel(280, 20)
        await expect
          .poll(() => camera.evaluate(element => element.scrollLeft))
          .toBeGreaterThan(200)
        expect(
          await localElements.evaluateAll(elements =>
            elements.map(element => element.scrollLeft),
          ),
        ).toEqual(Array(await localElements.count()).fill(0))
        expect(
          await page.locator(".player-board").evaluateAll(elements =>
            elements.map(element => getComputedStyle(element).transform),
          ),
        ).toEqual(boardTransformsBefore)
      }

      const verticalTargets = [
        firstSeat.locator(".zone--battlefield"),
        secondSeat.locator(".zone--battlefield"),
        firstSeat.locator(".zone--hand"),
        firstSeat.locator(".zone--battlefield .zone__empty"),
        firstSeat.locator(".pile-rail .zone").first(),
        centerControls,
      ]
      for (const target of verticalTargets) {
        await camera.evaluate(element => {
          element.scrollTop = (element.scrollHeight - element.clientHeight) / 2
          element.scrollLeft = 0
        })
        await localElements.evaluateAll(elements => {
          elements.forEach(element => {
            element.scrollTop = 0
            element.scrollLeft = 0
          })
        })
        await target.hover()
        const before = await camera.evaluate(element => ({
          left: element.scrollLeft,
          maxTop: element.scrollHeight - element.clientHeight,
          top: element.scrollTop,
        }))
        const centerPositionBefore = await centerBar.boundingBox()
        const topLaneBefore = await page
          .locator(".table-layout__lane--top")
          .boundingBox()
        const bottomLaneBefore = await page
          .locator(".table-layout__lane--bottom")
          .boundingBox()
        const boardTransformsBefore = await page
          .locator(".player-board")
          .evaluateAll(elements =>
            elements.map(element => getComputedStyle(element).transform),
          )
        const deltaY = before.top < before.maxTop - 200 ? 180 : -180
        await page.mouse.wheel(0, deltaY)
        await expect
          .poll(async () =>
            Math.abs(
              (await camera.evaluate(element => element.scrollTop)) -
                before.top,
            ),
          )
          .toBeGreaterThan(100)
        const cameraTopAfter = await camera.evaluate(
          element => element.scrollTop,
        )
        expect(await camera.evaluate(element => element.scrollLeft)).toBe(
          before.left,
        )
        expect(
          await localElements.evaluateAll(elements =>
            elements.map(element => ({
              left: element.scrollLeft,
              top: element.scrollTop,
            })),
          ),
        ).toEqual(
          Array(await localElements.count()).fill({ left: 0, top: 0 }),
        )
        const centerPositionAfter = await centerBar.boundingBox()
        const topLaneAfter = await page
          .locator(".table-layout__lane--top")
          .boundingBox()
        const bottomLaneAfter = await page
          .locator(".table-layout__lane--bottom")
          .boundingBox()
        expect(centerPositionAfter?.x).toBe(centerPositionBefore?.x)
        expect(centerPositionAfter?.y).toBeCloseTo(
          (centerPositionBefore?.y ?? 0) - (cameraTopAfter - before.top),
          0,
        )
        expect(
          (centerPositionAfter?.y ?? 0) -
            ((topLaneAfter?.y ?? 0) + (topLaneAfter?.height ?? 0)),
        ).toBeCloseTo(
          (centerPositionBefore?.y ?? 0) -
            ((topLaneBefore?.y ?? 0) + (topLaneBefore?.height ?? 0)),
          0,
        )
        expect(
          (bottomLaneAfter?.y ?? 0) -
            ((centerPositionAfter?.y ?? 0) +
              (centerPositionAfter?.height ?? 0)),
        ).toBeCloseTo(
          (bottomLaneBefore?.y ?? 0) -
            ((centerPositionBefore?.y ?? 0) +
              (centerPositionBefore?.height ?? 0)),
          0,
        )
        expect(
          await page.locator(".player-board").evaluateAll(elements =>
            elements.map(element => getComputedStyle(element).transform),
          ),
        ).toEqual(boardTransformsBefore)
      }
    }
    const centerBefore = await centerControls.boundingBox()
    const surfaceBefore = await page
      .locator(".table-layout__surface")
      .boundingBox()
    await camera.evaluate(element => {
      element.scrollLeft = Math.min(
        element.scrollWidth - element.clientWidth,
        900,
      )
    })
    const centerAfter = await centerControls.boundingBox()
    const surfaceAfter = await page
      .locator(".table-layout__surface")
      .boundingBox()
    expect(centerAfter?.x).toBe(centerBefore?.x)
    expect(surfaceAfter?.x).toBeLessThanOrEqual(surfaceBefore?.x ?? 0)
    const cameraBounds = await camera.boundingBox()
    expect(surfaceAfter?.x).toBeLessThanOrEqual(cameraBounds?.x ?? 0)
    expect(
      (surfaceAfter?.x ?? 0) + (surfaceAfter?.width ?? 0),
    ).toBeGreaterThanOrEqual(
      (cameraBounds?.x ?? 0) + (cameraBounds?.width ?? 0),
    )
    expect(surfaceAfter?.y).toBeLessThanOrEqual(cameraBounds?.y ?? 0)
    expect(
      (surfaceAfter?.y ?? 0) + (surfaceAfter?.height ?? 0),
    ).toBeGreaterThanOrEqual(
      (cameraBounds?.y ?? 0) + (cameraBounds?.height ?? 0),
    )
    const topLane = await page.locator(".table-layout__lane--top").boundingBox()
    const bottomLane = await page
      .locator(".table-layout__lane--bottom")
      .boundingBox()
    expect(topLane?.x).toBe(bottomLane?.x)

    expect(
      await page
        .locator(".table-layout__seat")
        .evaluateAll(elements => elements.map(element => element.scrollTop)),
    ).toEqual(Array(playerCount + (playerCount % 2)).fill(0))

    await expect(page.getByText(/Lokaal opgeslagen/)).toBeVisible()
    await page.reload()
    await expect(page.locator(".player-board")).toHaveCount(playerCount)
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })
}
