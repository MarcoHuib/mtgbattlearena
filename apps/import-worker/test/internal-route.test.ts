import { afterEach, expect, test, vi } from "vitest"
import importWorker from "../src/index.ts"

afterEach(() => vi.unstubAllGlobals())

test("private service-bindingroute accepteert het afgesproken contract zonder App Check", async () => {
  const cache = {
    match: vi.fn(() => Promise.resolve(undefined)),
    put: vi.fn(() => Promise.resolve()),
  }
  vi.stubGlobal("caches", { default: cache })
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        Response.json({
          id: 24765444,
          name: "Primal Stampede",
          cards: [
            {
              quantity: 1,
              categories: [{ name: "Commander" }],
              card: { uid: "card", name: "Commander", oracleCard: {} },
            },
          ],
        }),
      ),
    ),
  )
  const response = await importWorker.fetch(
    new Request("https://import.internal/internal/deck-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://archidekt.com/decks/24765444/primal_stampede",
      }),
    }),
    { RELEASE_VERSION: "test" },
    { waitUntil: vi.fn() },
  )
  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toMatchObject({
    cacheStatus: "MISS",
    deck: { sourceId: "24765444", name: "Primal Stampede" },
  })
  expect(cache.put).toHaveBeenCalledOnce()
})

test("iedere expliciete import raadpleegt opnieuw de gedeelde Archidekt-client", async () => {
  const values = new Map<string, Response>()
  const cache = {
    match: vi.fn((request: Request) =>
      Promise.resolve(values.get(request.url)?.clone()),
    ),
    put: vi.fn((request: Request, response: Response) => {
      values.set(request.url, response.clone())
      return Promise.resolve()
    }),
  }
  vi.stubGlobal("caches", { default: cache })
  const upstream = vi.fn(() =>
    Promise.resolve(
      Response.json({
        id: 24765444,
        name: "Primal Stampede",
        cards: [
          {
            quantity: 1,
            categories: [{ name: "Commander" }],
            card: { uid: "card", name: "Commander", oracleCard: {} },
          },
        ],
      }),
    ),
  )
  vi.stubGlobal("fetch", upstream)
  const context = { waitUntil: vi.fn() }
  const env = { RELEASE_VERSION: "test" }
  const requestImport = () =>
    importWorker.fetch(
      new Request("https://import.internal/internal/deck-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://archidekt.com/decks/24765444/primal_stampede",
        }),
      }),
      env,
      context,
    )
  const importedResponse = await requestImport()
  expect(importedResponse.status).toBe(200)
  const imported = (await importedResponse.json()) as {
    cacheStatus: string
    deck: { name: string }
  }
  expect(imported).toMatchObject({
    cacheStatus: "MISS",
    deck: { name: "Primal Stampede" },
  })
  const hit = await requestImport()
  await expect(hit.json()).resolves.toMatchObject({ cacheStatus: "REFRESHED" })
  expect(upstream).toHaveBeenCalledTimes(2)
})
