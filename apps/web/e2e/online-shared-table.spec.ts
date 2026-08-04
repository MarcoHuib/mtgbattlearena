import { expect, test } from "@playwright/test"

test("online gebruikt de gedeelde tafel en drag-and-dropactie", async ({
  page,
}) => {
  await page.goto("/online")
  await page.getByLabel("E-mailadres").fill("e2e@example.test")
  await page.getByLabel("Wachtwoord").fill("test-password")
  await page.getByRole("button", { name: "Inloggen" }).click()
  await expect(page.getByRole("button", { name: "Uitloggen" })).toBeVisible()
  await page.evaluate(() => {
    window.history.pushState({}, "", "/online/game/shared-table-e2e")
    window.dispatchEvent(new PopStateEvent("popstate"))
  })

  await expect(
    page.getByRole("heading", { name: "Wie mag beginnen?" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Gooi dobbelsteen" }).click()
  await page.getByRole("button", { name: "Start wedstrijd" }).click()

  const openingHand = page.getByRole("dialog", {
    name: "Openingshand van Jij",
  })
  await expect(openingHand).toBeVisible()
  await openingHand.getByRole("button", { name: "Deze hand houden" }).click()

  const ownBoard = page.getByLabel("Speelveld van Jij")
  const opponentBoard = page.getByLabel("Speelveld van Tegenstander 1")
  const hand = ownBoard.locator(".zone--hand")
  const battlefield = ownBoard.locator(".zone--battlefield")
  const card = hand.locator('[data-battle-draggable="true"]').first()

  await expect(ownBoard).toBeVisible()
  await expect(opponentBoard).toBeVisible()
  await expect(card).toBeVisible()
  await expect(battlefield).toHaveAttribute(
    "data-battle-drop-zone",
    "battlefield",
  )
  await expect(page.locator(".online-player")).toHaveCount(0)
  await expect(page.locator(".online-card")).toHaveCount(0)
  await expect(page.locator(".table-layout")).toHaveCount(1)
  await expect(
    page.locator('[data-seat-row="top"][data-seat-column="0"]'),
  ).toHaveAttribute("data-seat-player", "mock-player-1")
  await expect(
    page.locator('[data-seat-row="bottom"][data-seat-column="0"]'),
  ).toHaveAttribute("data-seat-player", "mock-player-2")

  const camera = page.getByTestId("table-camera")
  const centerBar = page.getByTestId("table-center-bar")
  const centerControls = page.getByTestId("table-center-controls")
  await expect(centerBar).toHaveCount(1)
  await page.locator(".table-layout__surface").evaluate(element => {
    element.style.minWidth = "200vw"
  })
  const localElements = page.locator(
    ".table-layout__seat, .player-board, .player-board .zone, .player-board .zone__cards",
  )
  const horizontalTargets = [
    ownBoard.locator(".zone--battlefield"),
    opponentBoard.locator(".zone--battlefield"),
    ownBoard.locator(".zone--battlefield .zone__empty"),
    hand,
    centerControls,
  ]
  for (const target of horizontalTargets) {
    await camera.evaluate(element => {
      element.scrollLeft = 0
    })
    await localElements.evaluateAll(elements => {
      elements.forEach(element => {
        element.scrollLeft = 0
      })
    })
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
  }
  const verticalTargets = [
    ownBoard.locator(".zone--battlefield"),
    opponentBoard.locator(".zone--battlefield"),
    hand,
    ownBoard.locator(".zone--battlefield .zone__empty"),
    ownBoard.locator(".pile-rail .zone").first(),
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
    const deltaY = before.top < before.maxTop - 200 ? 180 : -180
    await page.mouse.wheel(0, deltaY)
    await expect
      .poll(async () =>
        Math.abs(
          (await camera.evaluate(element => element.scrollTop)) - before.top,
        ),
      )
      .toBeGreaterThan(100)
    const cameraTopAfter = await camera.evaluate(element => element.scrollTop)
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
    ).toEqual(Array(await localElements.count()).fill({ left: 0, top: 0 }))
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
        ((centerPositionAfter?.y ?? 0) + (centerPositionAfter?.height ?? 0)),
    ).toBeCloseTo(
      (bottomLaneBefore?.y ?? 0) -
        ((centerPositionBefore?.y ?? 0) +
          (centerPositionBefore?.height ?? 0)),
      0,
    )
  }
  await camera.evaluate(element => {
    element.scrollLeft = 0
    element.scrollTop = (element.scrollHeight - element.clientHeight) / 2
  })

  await card.scrollIntoViewIfNeeded()
  const cardBounds = await card.boundingBox()
  const battlefieldBounds = await battlefield
    .locator(".zone__cards")
    .boundingBox()
  expect(cardBounds).not.toBeNull()
  expect(battlefieldBounds).not.toBeNull()

  await page.mouse.move(
    (cardBounds?.x ?? 0) + (cardBounds?.width ?? 0) / 2,
    (cardBounds?.y ?? 0) + (cardBounds?.height ?? 0) / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    (cardBounds?.x ?? 0) + (cardBounds?.width ?? 0) / 2,
    (cardBounds?.y ?? 0) + (cardBounds?.height ?? 0) / 2 - 12,
    { steps: 4 },
  )
  await expect(card).toHaveAttribute("data-dnd-dragging", "true")
  await page.mouse.move(
    (battlefieldBounds?.x ?? 0) + (battlefieldBounds?.width ?? 0) / 2,
    (battlefieldBounds?.y ?? 0) + (battlefieldBounds?.height ?? 0) / 2,
    { steps: 12 },
  )
  await page.mouse.up()

  await expect(battlefield.locator(".card")).toHaveCount(1)
  await expect(hand.locator(".card")).toHaveCount(6)

  await battlefield.locator(".card").click({ button: "right" })
  await expect(
    page.getByRole("dialog", { name: /Kaartacties voor/ }),
  ).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(
    page.getByRole("dialog", { name: /Kaartacties voor/ }),
  ).not.toBeVisible()
})
