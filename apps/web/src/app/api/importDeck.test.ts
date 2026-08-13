import { setAppCheckTokenProvider } from "../../firebaseAppCheck"
import { makeStore } from "../store"
import { importDeckFromUrl } from "./importDeck"
import {
  setGraphQLAuthTokenProvider,
  setGraphQLBaseUrl,
} from "./graphqlBaseQuery"

test("stuurt alleen de provider-URL en doet geen freshnesscall", async () => {
  setGraphQLBaseUrl("https://api.test")
  setGraphQLAuthTokenProvider(() => Promise.resolve(null))
  setAppCheckTokenProvider({ getToken: () => Promise.resolve("app-check") })
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      data: {
        deckFromUrl: {
          cacheStatus: "MISS",
          deckId: "deck",
          revisionId: "revision",
          deck: {
            source: "archidekt",
            sourceId: "42",
            sourceUrl: "https://archidekt.com/decks/42",
            name: "Deck",
            importedAt: "2026-01-01T00:00:00.000Z",
            cards: [],
            definitions: [],
          },
        },
      },
    }),
  )
  const deck = await importDeckFromUrl(
    makeStore().dispatch,
    "https://archidekt.com/decks/42",
  )
  expect(deck.id).toBe("deck")
  expect(fetchMock).toHaveBeenCalledOnce()
  const requestBody = fetchMock.mock.calls[0]?.[1]?.body
  const body = JSON.parse(
    typeof requestBody === "string" ? requestBody : "{}",
  ) as {
    variables: Record<string, unknown>
  }
  expect(body.variables).toEqual({ url: "https://archidekt.com/decks/42" })
})
