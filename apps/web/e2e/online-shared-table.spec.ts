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
