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
        sourceHash: "client-hint",
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
