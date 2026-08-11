import { setAppCheckTokenProvider } from "../../firebaseAppCheck"
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
  const requestBody = fetchMock.mock.calls[0]?.[1]?.body
  const body = JSON.parse(typeof requestBody === "string" ? requestBody : "{}") as {
    variables: { url: string; sourceHash: string }
  }
  expect(body.variables).toEqual({
    url: "https://archidekt.com/decks/42",
    sourceHash: "client-hint",
  })
})
