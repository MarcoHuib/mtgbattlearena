import { afterEach, beforeEach, vi } from "vitest"
import { setAppCheckTokenProvider } from "../firebaseAppCheck"
import { importArchidektDeck } from "./client"

beforeEach(() => {
  setAppCheckTokenProvider({
    getToken: () => Promise.resolve("test-app-check-token"),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("importArchidektDeck", () => {
  it("weigert een HTML-fallback als succesvolle deckresponse", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<!doctype html><html></html>", {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    )

    await expect(
      importArchidektDeck("https://archidekt.com/decks/24190600/test"),
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      message:
        "De deckservice gaf geen geldige deckdata terug. Probeer het later opnieuw.",
    })
    expect(
      new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).get(
        "X-Firebase-AppCheck",
      ),
    ).toBe("test-app-check-token")
  })
})
