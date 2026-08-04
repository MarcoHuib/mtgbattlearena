import { expect, test, type BrowserContext, type Page } from "@playwright/test"

const openOnlineGame = async (page: Page, email: string) => {
  await page.goto("/online")
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
  browserName,
}) => {
  test.skip(browserName !== "chromium", "De transporttest draait eenmaal.")
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
      openOnlineGame(pageB, "realtime-b@example.test"),
    ])

    await pageA.getByRole("button", { name: "Gooi dobbelsteen" }).click()
    await expect(
      pageB.getByRole("button", { name: "Start wedstrijd" }),
    ).toBeVisible()
    await pageA.getByRole("button", { name: "Start wedstrijd" }).click()
    await expect(
      pageB.getByRole("dialog", { name: "Openingshand van Jij" }),
    ).toBeVisible()
    await pageA
      .getByRole("dialog", { name: "Openingshand van Jij" })
      .getByRole("button", { name: "Deze hand houden" })
      .click()

    const boardA = pageA.getByLabel("Speelveld van Jij")
    const boardB = pageB.getByLabel("Speelveld van Jij")
    const handA = boardA.locator(".zone--hand")
    const battlefieldA = boardA.locator(".zone--battlefield")
    const cardA = handA.locator('[data-battle-draggable="true"]').first()
    await expect(cardA).toBeVisible()
    await expect(boardB.locator(".zone--battlefield .card")).toHaveCount(0)

    const cardBounds = await cardA.boundingBox()
    const battlefieldBounds = await battlefieldA
      .locator(".zone__cards")
      .boundingBox()
    expect(cardBounds).not.toBeNull()
    expect(battlefieldBounds).not.toBeNull()
    await pageA.mouse.move(
      (cardBounds?.x ?? 0) + (cardBounds?.width ?? 0) / 2,
      (cardBounds?.y ?? 0) + (cardBounds?.height ?? 0) / 2,
    )
    await pageA.mouse.down()
    await pageA.mouse.move(
      (battlefieldBounds?.x ?? 0) + (battlefieldBounds?.width ?? 0) / 2,
      (battlefieldBounds?.y ?? 0) + (battlefieldBounds?.height ?? 0) / 2,
      { steps: 12 },
    )
    await pageA.mouse.up()

    await expect(boardB.locator(".zone--battlefield .card")).toHaveCount(1)
    await expect.poll(() => readVersion(pageB)).toBe(await readVersion(pageA))

    await pageA.getByRole("button", { name: "Volgende beurt →" }).click()
    await expect(pageB.locator(".match-status__turn strong")).toHaveText(
      "Tegenstander 1",
    )
    await expect.poll(() => readVersion(pageB)).toBe(await readVersion(pageA))

    await pageB.getByRole("button", { name: "Verlaag leven van Jij" }).click()
    await expect(
      pageA.getByLabel("Levenspunten Jij").getByText("39"),
    ).toBeVisible()

    await pageB.getByRole("button", { name: "Opnieuw verbinden" }).click()
    await expect.poll(() => readVersion(pageB)).toBe(await readVersion(pageA))
    await pageA.getByRole("button", { name: "Verlaag leven van Jij" }).click()
    await expect(
      pageB.getByLabel("Levenspunten Jij").getByText("38"),
    ).toBeVisible()
    await expect.poll(() => readVersion(pageB)).toBe(await readVersion(pageA))
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
