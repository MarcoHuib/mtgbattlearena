import { expect, test } from "@playwright/test"
import { archidektFixture } from "../src/archidekt/fixtures"

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/4cWQGQAAAABJRU5ErkJggg==",
  "base64",
)

test("herstelt een gedownloade battle volledig offline", async ({
  page,
  context,
}) => {
  await page.route("**/api/import/archidekt/*", async route => {
    const deckId = route.request().url().split("/").at(-1)
    const fixture = structuredClone(archidektFixture)
    if (deckId === "222") {
      const background = fixture.cards[1]
      if (background) {
        background.categories = [{ name: "Commander" }]
        background.card.name = "Folk Hero"
        background.card.imageUri = "https://cards.test/folk-hero.jpg"
        background.card.oracleCard.typeLine =
          "Legendary Enchantment — Background"
      }
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...fixture,
        name: deckId === "111" ? "Verdant Resolve" : "Tidal Memory",
      }),
    })
  })
  await page.route("https://cards.test/**", async route => {
    await route.fulfill({ contentType: "image/png", body: pixel })
  })

  await page.goto("/")
  const fields = page.getByLabel("Openbare Archidekt-URL")
  await fields.nth(0).fill("https://archidekt.com/decks/111/verdant")
  await page.getByRole("button", { name: "Deck importeren" }).nth(0).click()
  await expect(page.getByText("Verdant Resolve")).toBeVisible()
  await fields.nth(1).fill("https://archidekt.com/decks/222/tidal")
  await page.getByRole("button", { name: "Deck importeren" }).click()
  await expect(page.getByText("Tidal Memory")).toBeVisible()

  await page.getByRole("button", { name: "Battle starten" }).click()
  const playerOneOpeningHand = page.getByRole("dialog", {
    name: "Openingshand van Verdant Resolve",
  })
  await expect(playerOneOpeningHand.locator(".card")).toHaveCount(7)
  await playerOneOpeningHand
    .getByRole("button", { name: "Deze hand houden" })
    .click()

  const playerTwoOpeningHand = page.getByRole("dialog", {
    name: "Openingshand van Tidal Memory",
  })
  const playerTwoOpeningCards = playerTwoOpeningHand.locator(".card")
  await expect(playerTwoOpeningCards).toHaveCount(7)
  await playerTwoOpeningHand
    .getByRole("button", { name: "Mulligan (0)" })
    .click()
  await expect(playerTwoOpeningCards).toHaveCount(7)
  await playerTwoOpeningHand
    .getByRole("button", { name: "Mulligan (1)" })
    .click()
  await expect(playerTwoOpeningCards).toHaveCount(7)
  await playerTwoOpeningHand
    .getByRole("button", { name: "Mulligan (2)" })
    .click()
  await expect(playerTwoOpeningCards).toHaveCount(6)
  await playerTwoOpeningHand
    .getByRole("button", { name: "Deze hand houden" })
    .click()
  await expect(playerTwoOpeningHand).not.toBeVisible()

  const opponentBoard = page.getByLabel("Speelveld van Tidal Memory")
  const opponentCommanderGroup = opponentBoard.locator(".zone--commander-group")
  await expect(opponentCommanderGroup.locator(".card")).toHaveCount(2)
  await expect(opponentCommanderGroup.locator(".card").nth(0)).toHaveAttribute(
    "data-card-name",
    "Aesi, Tyrant of Gyre Strait",
  )
  await expect(opponentCommanderGroup.locator(".card").nth(1)).toHaveAttribute(
    "data-card-name",
    "Folk Hero",
  )
  const commander = opponentCommanderGroup.locator(".card").first()
  await commander.hover()
  const commanderBox = await commander.boundingBox()
  const viewport = page.viewportSize()
  expect(commanderBox?.x).toBeGreaterThanOrEqual(0)
  expect(
    (commanderBox?.x ?? 0) + (commanderBox?.width ?? 0),
  ).toBeLessThanOrEqual(viewport?.width ?? 0)
  await page.mouse.move(0, 0)

  const opponentHand = opponentBoard.locator(".zone--hand")
  const opponentBattlefield = opponentBoard.locator(".zone--battlefield")
  const opponentHandCard = opponentHand.locator(".card").first()
  const battleLine = page.locator(".table-divider")
  const opponentHandBox = await opponentHand.boundingBox()
  const opponentBattlefieldBox = await opponentBattlefield.boundingBox()
  const battleLineBox = await battleLine.boundingBox()
  expect(opponentHandBox).not.toBeNull()
  expect(opponentBattlefieldBox).not.toBeNull()
  expect(battleLineBox).not.toBeNull()
  expect(
    (opponentHandBox?.y ?? 0) + (opponentHandBox?.height ?? 0),
  ).toBeLessThanOrEqual(opponentBattlefieldBox?.y ?? 0)
  expect(
    (opponentBattlefieldBox?.y ?? 0) + (opponentBattlefieldBox?.height ?? 0),
  ).toBeLessThanOrEqual(battleLineBox?.y ?? 0)
  await expect(opponentHand.locator(".zone__cards")).toHaveCSS(
    "overflow",
    "visible",
  )
  await opponentHandCard.hover()
  const opponentCardBox = await opponentHandCard.boundingBox()
  const opponentBoardBox = await opponentBoard.boundingBox()
  expect(opponentCardBox?.y).toBeGreaterThanOrEqual(opponentBoardBox?.y ?? 0)
  expect(
    (opponentCardBox?.y ?? 0) + (opponentCardBox?.height ?? 0),
  ).toBeLessThanOrEqual(battleLineBox?.y ?? 0)
  await page.mouse.move(0, 0)

  const playerOneBoard = page.getByLabel("Speelveld van Verdant Resolve")
  const playerOneBattlefieldBox = await playerOneBoard
    .locator(".zone--battlefield")
    .boundingBox()
  const playerOneHandBox = await playerOneBoard
    .locator(".zone--hand")
    .boundingBox()
  expect(playerOneBattlefieldBox?.y).toBeGreaterThanOrEqual(
    (battleLineBox?.y ?? 0) + (battleLineBox?.height ?? 0),
  )
  expect(playerOneHandBox?.y).toBeGreaterThanOrEqual(
    (playerOneBattlefieldBox?.y ?? 0) + (playerOneBattlefieldBox?.height ?? 0),
  )
  const selfCommandZone = playerOneBoard.locator(".zone--command")
  const selfCommander = selfCommandZone.locator(".card").first()
  await expect(selfCommandZone.locator(".zone__cards")).toHaveCSS(
    "overflow",
    "visible",
  )
  const selfCommanderSize = await selfCommander.boundingBox()
  await selfCommander.hover()
  await expect
    .poll(async () => (await selfCommander.boundingBox())?.width)
    .toBeGreaterThan((selfCommanderSize?.width ?? 0) * 1.4)
  await expect(playerOneBoard.locator(".edge-zones")).toHaveCSS(
    "z-index",
    "5000",
  )
  await expect(selfCommandZone).toHaveCSS("z-index", "5001")
  expect(
    await selfCommander.evaluate(element => {
      const clippingAncestors: string[] = []
      let ancestor = element.parentElement
      while (ancestor && !ancestor.classList.contains("board-surface")) {
        const overflowY = getComputedStyle(ancestor).overflowY
        if (overflowY === "hidden" || overflowY === "clip") {
          clippingAncestors.push(ancestor.className)
        }
        ancestor = ancestor.parentElement
      }
      return clippingAncestors
    }),
  ).toEqual([])
  await page.mouse.move(0, 0)

  await expect(playerOneBoard.locator(".card-stack img")).toHaveAttribute(
    "src",
    "/magic-card-back.webp",
  )
  const hand = playerOneBoard.locator(".zone--hand")
  await expect(hand.locator(".card")).toHaveCount(7)
  const card = hand.locator(".card").first()
  const cardName = await card.getAttribute("data-card-name")
  if (!cardName) throw new Error("De testkaart heeft geen naam")
  await expect(hand.locator(".card img")).toHaveCount(7)
  await expect(card.locator(".card__art img")).toHaveCSS(
    "object-fit",
    "contain",
  )
  const cardSize = await card.boundingBox()
  await card.hover()
  await expect
    .poll(async () => (await card.boundingBox())?.width)
    .toBeGreaterThan((cardSize?.width ?? 0) * 1.4)

  const battlefield = playerOneBoard.locator(".zone--battlefield")
  const cardBox = await card.boundingBox()
  const battlefieldBox = await battlefield.boundingBox()

  expect(cardBox).not.toBeNull()
  expect(battlefieldBox).not.toBeNull()

  await page.mouse.move(
    cardBox!.x + cardBox!.width / 2,
    cardBox!.y + cardBox!.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    battlefieldBox!.x + battlefieldBox!.width / 2,
    battlefieldBox!.y + battlefieldBox!.height / 2,
    { steps: 12 },
  )
  await expect(card).toHaveClass(/card--dragging/)
  await expect(battlefield).toHaveClass(/zone--drop-target/)
  await page.mouse.up()
  await expect(hand.locator(".card img")).toHaveCount(6)
  const battlefieldCard = playerOneBoard
    .locator(".zone--battlefield")
    .locator(`.card[data-card-name="${cardName}"]:not([data-dnd-placeholder])`)
  await expect(
    battlefieldCard.getByRole("img", { name: cardName }),
  ).toBeVisible()
  const positionedCard = battlefield.locator(
    `.battlefield-card-position:has(.card[data-card-name="${cardName}"]:not([data-dnd-placeholder]))`,
  )
  const firstPositionX = Number(
    await positionedCard.getAttribute("data-position-x"),
  )
  const firstPositionY = Number(
    await positionedCard.getAttribute("data-position-y"),
  )
  expect(firstPositionX).toBeGreaterThan(0.35)
  expect(firstPositionX).toBeLessThan(0.65)
  expect(firstPositionY).toBeGreaterThan(0.35)
  expect(firstPositionY).toBeLessThan(0.65)
  await expect(battlefieldCard).not.toHaveAttribute("data-dnd-dropping", "")
  await expect(battlefieldCard).not.toHaveAttribute("data-dnd-dragging", "true")

  await page.mouse.move(0, 0)
  await expect
    .poll(async () => (await battlefieldCard.boundingBox())?.width)
    .toBeLessThan(130)
  const battlefieldSurfaceBox = await battlefield
    .locator(".zone__cards")
    .boundingBox()
  const placedCardBox = await battlefieldCard.boundingBox()
  expect(battlefieldSurfaceBox).not.toBeNull()
  expect(placedCardBox).not.toBeNull()
  await page.mouse.move(
    placedCardBox!.x + placedCardBox!.width * 0.25,
    placedCardBox!.y + placedCardBox!.height * 0.25,
  )
  await page.mouse.down()
  await page.mouse.move(
    battlefieldSurfaceBox!.x + battlefieldSurfaceBox!.width * 0.76,
    battlefieldSurfaceBox!.y + battlefieldSurfaceBox!.height * 0.3,
    { steps: 12 },
  )
  await expect(battlefieldCard).toHaveAttribute("data-dnd-dragging", "true")
  await expect
    .poll(async () => (await battlefieldCard.boundingBox())?.width)
    .toBeLessThan(130)
  await expect(battlefield).toHaveClass(/zone--drop-target/)
  await page.mouse.up()
  await expect
    .poll(async () =>
      Number(await positionedCard.getAttribute("data-position-x")),
    )
    .toBeGreaterThan(0.68)
  await expect
    .poll(async () =>
      Number(await positionedCard.getAttribute("data-position-y")),
    )
    .toBeGreaterThan(0.35)
  await expect
    .poll(async () =>
      Number(await positionedCard.getAttribute("data-position-y")),
    )
    .toBeLessThan(0.48)
  await expect(battlefieldCard).not.toHaveAttribute("data-dnd-dropping", "")

  const freelyPlacedCardBox = await battlefieldCard.boundingBox()
  expect(freelyPlacedCardBox).not.toBeNull()
  await page.mouse.move(
    freelyPlacedCardBox!.x + freelyPlacedCardBox!.width / 2,
    freelyPlacedCardBox!.y + freelyPlacedCardBox!.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    battlefieldSurfaceBox!.x + battlefieldSurfaceBox!.width * 0.55,
    battlefieldSurfaceBox!.y + battlefieldSurfaceBox!.height * 0.98,
    { steps: 12 },
  )
  await expect(battlefieldCard).toHaveAttribute("data-dnd-dragging", "true")
  await expect
    .poll(async () => (await battlefieldCard.boundingBox())?.width)
    .toBeLessThan(130)
  await page.mouse.up()
  await expect
    .poll(async () =>
      Number(await positionedCard.getAttribute("data-position-y")),
    )
    .toBeGreaterThan(0.72)
  await expect(battlefieldCard).not.toHaveAttribute("data-dnd-dropping", "")
  await page.mouse.move(0, 0)
  const bottomCardBox = await battlefieldCard.boundingBox()
  const currentBattlefieldSurfaceBox = await battlefield
    .locator(".zone__cards")
    .boundingBox()
  expect(bottomCardBox).not.toBeNull()
  expect(currentBattlefieldSurfaceBox).not.toBeNull()
  expect(
    (currentBattlefieldSurfaceBox?.y ?? 0) +
      (currentBattlefieldSurfaceBox?.height ?? 0) -
      ((bottomCardBox?.y ?? 0) + (bottomCardBox?.height ?? 0)),
  ).toBeLessThan(3)
  const overlappingHandCard = hand.locator(".card").nth(3)
  const overlappingHandCardName =
    await overlappingHandCard.getAttribute("data-card-name")
  const handCardSize = await overlappingHandCard.boundingBox()
  await overlappingHandCard.hover()
  await expect
    .poll(async () => (await overlappingHandCard.boundingBox())?.width)
    .toBeGreaterThan((handCardSize?.width ?? 0) * 1.4)
  await expect(hand).toHaveCSS("z-index", "5000")
  const zoomedHandCardBox = await overlappingHandCard.boundingBox()
  const overlapLeft = Math.max(bottomCardBox?.x ?? 0, zoomedHandCardBox?.x ?? 0)
  const overlapRight = Math.min(
    (bottomCardBox?.x ?? 0) + (bottomCardBox?.width ?? 0),
    (zoomedHandCardBox?.x ?? 0) + (zoomedHandCardBox?.width ?? 0),
  )
  const overlapTop = Math.max(bottomCardBox?.y ?? 0, zoomedHandCardBox?.y ?? 0)
  const overlapBottom = Math.min(
    (bottomCardBox?.y ?? 0) + (bottomCardBox?.height ?? 0),
    (zoomedHandCardBox?.y ?? 0) + (zoomedHandCardBox?.height ?? 0),
  )
  expect(overlapRight - overlapLeft).toBeGreaterThan(0)
  expect(overlapBottom - overlapTop).toBeGreaterThan(0)
  expect(
    await page.evaluate(
      ({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.closest<HTMLElement>(".card")
          ?.getAttribute("data-card-name") ?? null,
      {
        x: (overlapLeft + overlapRight) / 2,
        y: (overlapTop + overlapBottom) / 2,
      },
    ),
  ).toBe(overlappingHandCardName)
  await page.mouse.move(0, 0)

  await expect(
    battlefieldCard.getByRole("button", {
      name: `Acties voor ${cardName}`,
    }),
  ).toHaveCount(0)
  await battlefieldCard.click({ button: "right" })
  await page
    .getByRole("button", {
      name: `Voeg +1/+1-counter toe aan ${cardName}`,
    })
    .click()
  await expect(battlefieldCard.getByText("+1/+1 ×1")).toBeVisible()
  await page.getByRole("button", { name: "Kaartacties sluiten" }).click()

  await battlefieldCard.dblclick()
  await expect(battlefieldCard).toHaveClass(/card--tapped/)
  await page.mouse.move(0, 0)
  await expect
    .poll(() =>
      battlefieldCard.evaluate(element => getComputedStyle(element).transform),
    )
    .toBe("matrix(0, 1, -1, 0, 0, 0)")

  const tappedBaseBox = await battlefieldCard.boundingBox()
  expect(tappedBaseBox).not.toBeNull()
  await battlefieldCard.hover()
  await expect
    .poll(async () => (await battlefieldCard.boundingBox())?.width)
    .toBeGreaterThan(200)
  const cardBorderPoint = await battlefieldCard.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    const candidates: { x: number; y: number }[] = []
    for (
      let y = Math.ceil(bounds.top + 1);
      y < Math.floor(bounds.bottom - 1);
      y += 1
    ) {
      candidates.push({ x: bounds.left + 1, y })
      candidates.push({ x: bounds.right - 1, y })
    }
    for (
      let x = Math.ceil(bounds.left + 1);
      x < Math.floor(bounds.right - 1);
      x += 1
    ) {
      candidates.push({ x, y: bounds.top + 1 })
      candidates.push({ x, y: bounds.bottom - 1 })
    }
    return (
      candidates.find(
        point => document.elementFromPoint(point.x, point.y) === element,
      ) ?? null
    )
  })
  expect(cardBorderPoint).not.toBeNull()
  await page.mouse.move(cardBorderPoint!.x, cardBorderPoint!.y)
  await page.mouse.down()
  await expect(page.locator("html")).toHaveClass(/card-pointer-active/)
  await expect(battlefieldCard).toHaveClass(/card--pointer-held/)
  await expect
    .poll(async () => (await battlefieldCard.boundingBox())?.width)
    .toBeLessThan(170)
  const tappedDragPointer = {
    x: battlefieldSurfaceBox!.x + battlefieldSurfaceBox!.width * 0.42,
    y: battlefieldSurfaceBox!.y + battlefieldSurfaceBox!.height * 0.5,
  }
  await page.mouse.move(tappedDragPointer.x, tappedDragPointer.y, { steps: 12 })
  await expect(battlefieldCard).toHaveAttribute("data-dnd-dragging", "true")
  const everyTappedCardRepresentation = page.locator(
    `.card[data-card-name="${cardName}"][aria-label*="Battlefield"]`,
  )
  await expect
    .poll(() => everyTappedCardRepresentation.count())
    .toBeGreaterThan(1)
  await expect
    .poll(async () => {
      const draggingCard = page.locator(
        `.card[data-card-name="${cardName}"][aria-label*="Battlefield"][data-dnd-dragging="true"]`,
      )
      const bounds = await draggingCard.boundingBox()
      if (!bounds) return Number.POSITIVE_INFINITY
      const distanceX = Math.max(
        bounds.x - tappedDragPointer.x,
        0,
        tappedDragPointer.x - (bounds.x + bounds.width),
      )
      const distanceY = Math.max(
        bounds.y - tappedDragPointer.y,
        0,
        tappedDragPointer.y - (bounds.y + bounds.height),
      )
      return Math.hypot(distanceX, distanceY)
    })
    .toBeLessThan(3)
  await expect
    .poll(() =>
      everyTappedCardRepresentation.evaluateAll(elements =>
        Math.max(
          ...elements.map(element => element.getBoundingClientRect().width),
        ),
      ),
    )
    .toBeLessThan((tappedBaseBox?.width ?? 0) + 5)
  await expect
    .poll(() =>
      everyTappedCardRepresentation.evaluateAll(elements =>
        Math.max(
          ...elements.map(element => element.getBoundingClientRect().height),
        ),
      ),
    )
    .toBeLessThan((tappedBaseBox?.height ?? 0) + 5)
  await page.waitForTimeout(600)
  await expect(page.locator("html")).toHaveClass(/card-pointer-active/)
  await expect
    .poll(() =>
      everyTappedCardRepresentation.evaluateAll(elements =>
        Math.max(
          ...elements.map(element => element.getBoundingClientRect().width),
        ),
      ),
    )
    .toBeLessThan((tappedBaseBox?.width ?? 0) + 5)
  await expect
    .poll(() =>
      everyTappedCardRepresentation.evaluateAll(elements =>
        Math.max(
          ...elements.map(element => element.getBoundingClientRect().height),
        ),
      ),
    )
    .toBeLessThan((tappedBaseBox?.height ?? 0) + 5)
  await page.mouse.up()
  await expect(page.locator("html")).toHaveClass(/card-pointer-active/)
  await expect
    .poll(() =>
      everyTappedCardRepresentation.evaluateAll(elements =>
        Math.max(
          ...elements.map(element => element.getBoundingClientRect().width),
        ),
      ),
    )
    .toBeLessThan((tappedBaseBox?.width ?? 0) + 5)
  await expect(battlefieldCard).not.toHaveClass(/card--pointer-held/)
  await expect(battlefieldCard).not.toHaveAttribute("data-dnd-dropping", "")
  await expect(page.locator("html")).not.toHaveClass(/card-pointer-active/)
  const movedPositionX = await positionedCard.getAttribute("data-position-x")
  const movedPositionY = await positionedCard.getAttribute("data-position-y")

  const nextTurnButton = page.getByRole("button", { name: /^Next turn:/ })
  await nextTurnButton.click()
  await expect(
    page.getByLabel("Speelveld van Tidal Memory").getByText("Aan de beurt"),
  ).toBeVisible()
  await expect(battlefieldCard).toHaveClass(/card--tapped/)
  await nextTurnButton.click()
  await expect(playerOneBoard.getByText("Aan de beurt")).toBeVisible()
  await expect(battlefieldCard).not.toHaveClass(/card--tapped/)
  await expect
    .poll(() =>
      battlefieldCard.evaluate(element => getComputedStyle(element).transform),
    )
    .toBe("none")
  await expect(hand.locator(".card")).toHaveCount(7)

  await page
    .getByRole("button", { name: /Verlaag leven van Verdant Resolve/ })
    .click()
  await expect(
    page.getByLabel("Levenspunten Verdant Resolve").getByText("39"),
  ).toBeVisible()
  await expect(page.getByText(/Lokaal opgeslagen/)).toBeVisible()

  await page.reload()
  await expect(page.getByText("Lokale battle hervat")).toBeVisible()
  await expect(
    page.getByLabel("Levenspunten Verdant Resolve").getByText("39"),
  ).toBeVisible()
  await expect(positionedCard).toHaveAttribute(
    "data-position-x",
    movedPositionX ?? "",
  )
  await expect(positionedCard).toHaveAttribute(
    "data-position-y",
    movedPositionY ?? "",
  )

  await page
    .getByRole("button", { name: "Download voor offline gebruik" })
    .click()
  await page
    .getByRole("button", { name: "Download voor offline gebruik" })
    .last()
    .click()
  await expect(page.getByText("Volledig offline beschikbaar")).toBeVisible({
    timeout: 30_000,
  })
  await page.evaluate(() => navigator.serviceWorker.ready)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText("Lokale battle hervat")).toBeVisible()
  await expect(page.getByLabel(/Speelveld van Verdant Resolve/)).toBeVisible()
  await expect(
    page.locator(`[data-card-name="${cardName}"] img`).first(),
  ).toBeVisible()
})
