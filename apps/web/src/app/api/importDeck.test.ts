import { setAppCheckTokenProvider } from "../../firebaseAppCheck"
import { fingerprintArchidektSource } from "@mtg/deck-source"
import { makeStore } from "../store"
import { importDeckFromUrl } from "./importDeck"
import {
  setGraphQLAuthTokenProvider,
  setGraphQLBaseUrl,
} from "./graphqlBaseQuery"

test("stuurt provider-URL en optionele sourceHash via het gegenereerde RTK Query-endpoint", async () => {
  setGraphQLBaseUrl("https://api.test")
  setGraphQLAuthTokenProvider(() => Promise.resolve(null))
  setAppCheckTokenProvider({ getToken: () => Promise.resolve("app-check") })
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      data: {
        deckFromUrl: {
          cacheStatus: "HIT",
          deckId: "00000000-0000-4000-8000-000000000042",
          deck: {
            source: "archidekt",
            sourceId: "42",
            sourceUrl: "https://archidekt.com/decks/42",
            sourceHash: "server-hash",
            name: "Deck",
            importedAt: "2026-01-01T00:00:00.000Z",
            cards: [],
            definitions: [],
          },
        },
      },
    }),
  )
  const store = makeStore()
  const deck = await importDeckFromUrl(
    store.dispatch,
    "https://archidekt.com/decks/42",
    "client-hint",
  )
  expect(deck.sourceHash).toBe("server-hash")
  expect(deck.id).toBe("00000000-0000-4000-8000-000000000042")
  const requestBody = fetchMock.mock.calls[0]?.[1]?.body
  const body = JSON.parse(
    typeof requestBody === "string" ? requestBody : "{}",
  ) as {
    variables: { url: string; sourceHash: string }
  }
  expect(body.variables).toEqual({
    url: "https://archidekt.com/decks/42",
    sourceHash: "client-hint",
  })
})

test("observeert de actuele bron en stuurt automatisch de gedeelde fingerprint", async () => {
  setGraphQLBaseUrl("https://api.test")
  setGraphQLAuthTokenProvider(() => Promise.resolve(null))
  setAppCheckTokenProvider({ getToken: () => Promise.resolve("app-check") })
  const rawDeck = {
    name: "Raw provider name",
    cards: [{ quantity: 2, categories: [], card: { uid: "one", name: "One" } }],
  }
  const expectedHash = await fingerprintArchidektSource(rawDeck, null)
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(input => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    if (url.includes("/api/import/archidekt/42"))
      return Promise.resolve(Response.json(rawDeck))
    return Promise.resolve(
      Response.json({
        data: {
          deckFromUrl: {
            cacheStatus: "REFRESHED",
            deckId: "00000000-0000-4000-8000-000000000042",
            deck: {
              source: "archidekt",
              sourceId: "42",
              sourceUrl: "https://archidekt.com/decks/42",
              sourceHash: expectedHash,
              name: "Backend mapped name",
              importedAt: "2026-01-01T00:00:00.000Z",
              cards: [],
              definitions: [],
            },
          },
        },
      }),
    )
  })
  const store = makeStore()
  const deck = await importDeckFromUrl(
    store.dispatch,
    "https://archidekt.com/decks/42",
  )
  expect(deck.name).toBe("Backend mapped name")
  expect(fetchMock).toHaveBeenCalledTimes(2)
  const sourceInput = fetchMock.mock.calls[0]?.[0]
  const sourceUrl =
    typeof sourceInput === "string"
      ? sourceInput
      : sourceInput instanceof URL
        ? sourceInput.href
        : sourceInput?.url
  expect(sourceUrl).toContain("fresh=1")
  const sourceHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
  expect(sourceHeaders.get("X-Firebase-AppCheck")).toBe("app-check")
  const requestBody = fetchMock.mock.calls[1]?.[1]?.body
  const body = JSON.parse(
    typeof requestBody === "string" ? requestBody : "{}",
  ) as {
    variables: { sourceHash: string }
  }
  expect(body.variables.sourceHash).toBe(expectedHash)
})
