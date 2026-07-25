import { DeckImportError } from "./errors"
import { parseArchidektDeckId } from "./url"

describe("parseArchidektDeckId", () => {
  it.each([
    ["https://archidekt.com/decks/12345", "12345"],
    ["https://archidekt.com/decks/12345/", "12345"],
    ["https://www.archidekt.com/decks/987/a-deck-slug", "987"],
    ["https://archidekt.com/decks/42/a-deck?sort=alpha", "42"],
  ])("leest %s", (url, expected) => {
    expect(parseArchidektDeckId(url)).toBe(expected)
  })

  it.each([
    "geen url",
    "http://archidekt.com/decks/123",
    "https://example.com/decks/123",
    "https://archidekt.com/decks/not-a-number",
    "https://archidekt.com/decks/0",
  ])("weigert %s", url => {
    expect(() => parseArchidektDeckId(url)).toThrow(DeckImportError)
  })
})
