import { describe, expect, test, vi } from "vitest"
import { fingerprintArchidektSource } from "@mtg/deck-source"
import { createDeckImportService } from "../src/deck-import-service"
import { parseArchidektUrl } from "../src/providers/archidekt"

const rawDeck = (quantity = 1, commander = true) => ({
  id: 123,
  name: "Provider Neutral",
  views: Math.random(),
  cards: [
    {
      quantity,
      categories: [{ name: commander ? "Commander" : "Mainboard" }],
      card: {
        uid: "card-one",
        name: "One",
        oracleCard: {
          oracleId: "oracle-one",
          typeLine: "Legendary Creature",
          tokens: [42],
        },
      },
    },
  ],
})
const rawTokens = {
  results: [
    {
      uid: "token-one",
      name: "Treasure",
      oracleCard: {
        layout: "token",
        types: ["Token", "Artifact"],
        subTypes: ["Treasure"],
      },
    },
  ],
}

class MemoryCache {
  values = new Map<string, Response>()
  match(request: Request): Promise<Response | undefined> {
    return Promise.resolve(this.values.get(request.url)?.clone())
  }
  put(request: Request, response: Response): Promise<void> {
    this.values.set(request.url, response.clone())
    return Promise.resolve()
  }
}
const fetcher = (deck = rawDeck()) =>
  vi.fn<typeof fetch>(input => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    return Promise.resolve(
      Response.json(url.includes("/api/decks/") ? deck : rawTokens),
    )
  })

test("herkent uitsluitend veilige Archidekt deck-URL's", () => {
  expect(
    parseArchidektUrl("https://www.archidekt.com/decks/123/slug"),
  ).toMatchObject({ sourceId: "123" })
  for (const url of [
    "http://archidekt.com/decks/1",
    "https://evil.test/decks/1",
    "https://user:pass@archidekt.com/decks/1",
    "https://archidekt.com:444/decks/1",
    "not-a-url",
  ]) {
    expect(() => parseArchidektUrl(url)).toThrow()
  }
})

test("een willekeurige host kan nooit een uitgaande fetch afdwingen", async () => {
  const upstream = vi.fn()
  await expect(
    createDeckImportService({
      cache: new MemoryCache(),
      fetcher: upstream,
    }).importFromUrl("https://attacker.test/decks/123"),
  ).rejects.toMatchObject({ code: "UNSUPPORTED_DECK_PROVIDER" })
  expect(upstream).not.toHaveBeenCalled()
})

describe("application DTO cache", () => {
  test("miss fetcht, valideert, hasht en cachet het DTO", async () => {
    const cache = new MemoryCache()
    const upstream = fetcher()
    const result = await createDeckImportService({
      cache,
      fetcher: upstream,
    }).importFromUrl("https://archidekt.com/decks/123/test")
    expect(result.cacheStatus).toBe("MISS")
    expect(upstream).toHaveBeenCalledTimes(2)
    expect(result.deck.sourceHash).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(result.deck)).not.toContain("categories")
  })

  test("hit zonder hash en met matching hash doen geen providercall", async () => {
    const cache = new MemoryCache()
    const first = fetcher()
    const service = createDeckImportService({ cache, fetcher: first })
    const imported = await service.importFromUrl(
      "https://archidekt.com/decks/123",
    )
    const noFetch = vi.fn()
    const cachedService = createDeckImportService({ cache, fetcher: noFetch })
    expect(
      (await cachedService.importFromUrl("https://archidekt.com/decks/123"))
        .cacheStatus,
    ).toBe("HIT")
    expect(
      (
        await cachedService.importFromUrl(
          "https://archidekt.com/decks/123",
          imported.deck.sourceHash,
        )
      ).cacheStatus,
    ).toBe("HIT")
    expect(noFetch).not.toHaveBeenCalled()
  })

  test("mismatch refetcht en gebruikt uitsluitend de backendhash", async () => {
    const cache = new MemoryCache()
    await createDeckImportService({ cache, fetcher: fetcher() }).importFromUrl(
      "https://archidekt.com/decks/123",
    )
    const result = await createDeckImportService({
      cache,
      fetcher: fetcher(rawDeck(2)),
    }).importFromUrl(
      "https://archidekt.com/decks/123",
      "client-is-not-authoritative",
    )
    expect(result.cacheStatus).toBe("REFRESHED")
    expect(result.deck.sourceHash).not.toBe("client-is-not-authoritative")
    expect(result.deck.cards[0].quantity).toBe(2)
  })

  test("ongeldige refresh overschrijft de geldige cache niet", async () => {
    const cache = new MemoryCache()
    const original = await createDeckImportService({
      cache,
      fetcher: fetcher(),
    }).importFromUrl("https://archidekt.com/decks/123")
    const invalidFetch = vi.fn<typeof fetch>(input => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      return Promise.resolve(
        Response.json(
          url.includes("/api/decks/")
            ? { name: "broken", cards: [{ nope: true }] }
            : rawTokens,
        ),
      )
    })
    await expect(
      createDeckImportService({ cache, fetcher: invalidFetch }).importFromUrl(
        "https://archidekt.com/decks/123",
        "different",
      ),
    ).rejects.toThrow()
    const retained = await createDeckImportService({
      cache,
      fetcher: vi.fn(),
    }).importFromUrl("https://archidekt.com/decks/123")
    expect(retained.deck.sourceHash).toBe(original.deck.sourceHash)
  })
})

test("gedeelde bronfingerprint is orde-onafhankelijk en detecteert deckwijzigingen", async () => {
  const base = rawDeck(1)
  const hash = await fingerprintArchidektSource(base, rawTokens)
  expect(
    await fingerprintArchidektSource(
      { ...base, cards: [...base.cards].reverse() },
      { results: [...rawTokens.results].reverse() },
    ),
  ).toBe(hash)
  expect(await fingerprintArchidektSource(rawDeck(2), rawTokens)).not.toBe(hash)
})
