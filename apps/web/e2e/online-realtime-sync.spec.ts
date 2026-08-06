import { expect, test, type BrowserContext, type Page } from "@playwright/test"

const openOnlineGame = async (
  page: Page,
  email: string,
  mockPlayerId?: string,
) => {
  await page.goto("/online")
  if (mockPlayerId) {
    await page.evaluate(playerId => {
      localStorage.setItem("mtg-mock-player-id", playerId)
    }, mockPlayerId)
  }
  await page.getByLabel("E-mailadres").fill(email)
  await page.getByLabel("Wachtwoord").fill("test-password")
  await page.getByRole("button", { name: "Inloggen" }).click()
  await page.evaluate(() => {
    window.history.pushState({}, "", "/online/game/realtime-two-contexts")
    window.dispatchEvent(new PopStateEvent("popstate"))
  })
  await expect(page.getByText("Serverstate v0")).toBeVisible()
}

const readVersion = async (page: Page) => {
  const label = await page.getByText(/Serverstate v\d+/).textContent()
  return Number(label?.match(/\d+/)?.[0] ?? -1)
}

const installCrossContextChannel = async (
  context: BrowserContext,
  peers: () => Page[],
) => {
  await context.exposeBinding(
    "__mtgBroadcastChannelPost",
    async ({ page: source }, payload: { name: string; data: unknown }) => {
      await Promise.all(
        peers()
          .filter(page => page !== source && !page.isClosed())
          .map(page =>
            page.evaluate(message => {
              window.dispatchEvent(
                new CustomEvent("mtg-e2e-broadcast-channel", {
                  detail: message,
                }),
              )
            }, payload),
          ),
      )
    },
  )
  await context.addInitScript(() => {
    type BridgeMessage = { name: string; data: unknown }
    type BridgePost = (payload: BridgeMessage) => Promise<void>
    const instances = new Set<TestBroadcastChannel>()
    class TestBroadcastChannel extends EventTarget {
      onmessage: ((event: MessageEvent) => void) | null = null

      constructor(readonly name: string) {
        super()
        instances.add(this)
      }

      postMessage(data: unknown) {
        const post = (
          globalThis as typeof globalThis & {
            __mtgBroadcastChannelPost: BridgePost
          }
        ).__mtgBroadcastChannelPost
        void post({ name: this.name, data })
      }

      close() {
        instances.delete(this)
      }
    }
    window.addEventListener("mtg-e2e-broadcast-channel", event => {
      const message = (event as CustomEvent<BridgeMessage>).detail
      for (const instance of instances) {
        if (instance.name !== message.name) continue
        const incoming = new MessageEvent("message", { data: message.data })
        instance.onmessage?.(incoming)
        instance.dispatchEvent(incoming)
      }
    })
    globalThis.BroadcastChannel =
      TestBroadcastChannel as unknown as typeof BroadcastChannel
  })
}

test("twee browsercontexts ontvangen mutations zonder refresh", async ({
  browser,
}) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pages: Page[] = []
  await Promise.all([
    installCrossContextChannel(contextA, () => pages),
    installCrossContextChannel(contextB, () => pages),
  ])
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()
  pages.push(pageA, pageB)

  try {
    await Promise.all([
      openOnlineGame(pageA, "realtime-a@example.test"),
      openOnlineGame(pageB, "realtime-b@example.test", "mock-player-2"),
    ])

    await pageA.getByRole("button", { name: "Gooi dobbelsteen" }).click()
    await expect(
      pageB.getByText("Wachten tot de host de wedstrijd start…"),
    ).toBeVisible()
    await pageA.getByRole("button", { name: "Start wedstrijd" }).click()
    await expect(pageB.getByRole("dialog")).toHaveCount(0)
    await pageA
      .getByRole("dialog", { name: "Openingshand van Jij" })
      .getByRole("button", { name: "Deze hand houden" })
      .click()

    const boardA = pageA.getByLabel("Speelveld van Jij")
    const boardB = pageB.getByLabel("Speelveld van Tegenstander 1")
    const opponentBoardB = pageB.getByLabel("Speelveld van Jij")
    const handA = boardA.locator(".zone--hand")
    const battlefieldA = boardA.locator(".zone--battlefield")
    const cardA = handA.locator('[data-battle-draggable="true"]').first()
    await expect(cardA).toBeVisible()
    await expect(boardB.locator(".zone--battlefield .card")).toHaveCount(0)
    await expect(
      pageA.locator(
        '[data-seat-row="bottom"][data-seat-player="mock-player-1"]',
      ),
    ).toBeVisible()
    await expect(
      pageB.locator(
        '[data-seat-row="bottom"][data-seat-player="mock-player-2"]',
      ),
    ).toBeVisible()
    const [ownHandA, ownFieldA, ownHandB, ownFieldB] = await Promise.all([
      boardA.locator(".zone--hand").boundingBox(),
      boardA.locator(".zone--battlefield").boundingBox(),
      boardB.locator(".zone--hand").boundingBox(),
      boardB.locator(".zone--battlefield").boundingBox(),
    ])
    expect(ownHandA?.y).toBeGreaterThan(ownFieldA?.y ?? Number.MAX_VALUE)
    expect(ownHandB?.y).toBeGreaterThan(ownFieldB?.y ?? Number.MAX_VALUE)

    await cardA.click({ button: "right" })
    await pageA
      .getByRole("dialog", { name: /Kaartacties voor/ })
      .getByLabel(/Verplaats/)
      .selectOption("battlefield")

    await expect(battlefieldA.locator(".card")).toHaveCount(1)
    await expect(
      opponentBoardB.locator(".zone--battlefield .card"),
    ).toHaveCount(1)
    await expect.poll(() => readVersion(pageB)).toBe(await readVersion(pageA))

    const battlefieldCardA = battlefieldA.locator(".card").first()
    const battlefieldCardB = opponentBoardB
      .locator(".zone--battlefield .card")
      .first()
    const versionBeforePreview = await readVersion(pageA)
    await battlefieldCardA.click({ button: "right" })
    const faceDialog = pageA.getByRole("dialog", {
      name: "Kaartacties voor Demo kaart 1",
    })
    await expect(
      faceDialog.getByText("Actieve previewzijde: Demo kaart 1"),
    ).toBeVisible()
    await faceDialog
      .getByRole("button", {
        name: "Toon Demo kaart 1 achterkant in preview",
      })
      .click()
    await expect(
      faceDialog.getByText("Actieve previewzijde: Demo kaart 1 achterkant"),
    ).toBeVisible()
    await expect(battlefieldCardA).toHaveAttribute(
      "data-active-face-index",
      "0",
    )
    await expect(battlefieldCardB).toHaveAttribute(
      "data-active-face-index",
      "0",
    )
    expect(await readVersion(pageA)).toBe(versionBeforePreview)
    expect(await readVersion(pageB)).toBe(versionBeforePreview)

    await faceDialog
      .getByRole("button", { name: "Kaartacties sluiten" })
      .click()
    await battlefieldCardA.click({ button: "right" })
    await expect(
      pageA
        .getByRole("dialog", { name: "Kaartacties voor Demo kaart 1" })
        .getByText("Actieve previewzijde: Demo kaart 1"),
    ).toBeVisible()
    await pageA
      .getByRole("dialog", { name: "Kaartacties voor Demo kaart 1" })
      .getByRole("button", {
        name: "Draai Demo kaart 1 om op het battlefield",
      })
      .click()
    await expect(battlefieldCardA).toHaveAttribute(
      "data-active-face-index",
      "1",
    )
    await expect(battlefieldCardB).toHaveAttribute(
      "data-active-face-index",
      "1",
    )
    await expect(battlefieldCardA).toHaveAccessibleName(
      /Demo kaart 1 achterkant, Battlefield/,
    )
    await expect(battlefieldCardB).toHaveAccessibleName(
      /Demo kaart 1 achterkant, Battlefield/,
    )
    await expect.poll(() => readVersion(pageB)).toBe(await readVersion(pageA))

    await pageA.getByRole("button", { name: "Volgende beurt →" }).click()
    await expect(pageB.locator(".match-status__turn strong")).toHaveText(
      "Tegenstander 1",
    )
    await expect.poll(() => readVersion(pageB)).toBe(await readVersion(pageA))

    await pageB
      .getByRole("button", { name: "Verlaag leven van Tegenstander 1" })
      .click()
    await expect(
      pageA.getByLabel("Levenspunten Tegenstander 1").getByText("39"),
    ).toBeVisible()

    await pageB.getByRole("button", { name: "Opnieuw verbinden" }).click()
    await expect.poll(() => readVersion(pageB)).toBe(await readVersion(pageA))
    await expect(
      pageB
        .getByLabel("Speelveld van Jij")
        .locator(".zone--battlefield .card")
        .first(),
    ).toHaveAttribute("data-active-face-index", "1")
    await pageA.getByRole("button", { name: "Verlaag leven van Jij" }).click()
    await expect(
      pageB.getByLabel("Levenspunten Jij").getByText("39"),
    ).toBeVisible()
    await expect.poll(() => readVersion(pageB)).toBe(await readVersion(pageA))
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
