import { DeckImportError } from "./errors"

const ALLOWED_HOSTS = new Set(["archidekt.com", "www.archidekt.com"])

export const parseArchidektDeckId = (input: string): string => {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new DeckImportError(
      "INVALID_URL",
      "Vul een volledige openbare Archidekt-deck-URL in.",
    )
  }

  if (
    url.protocol !== "https:" ||
    !ALLOWED_HOSTS.has(url.hostname.toLowerCase())
  ) {
    throw new DeckImportError(
      "INVALID_URL",
      "Alleen https-URL’s van archidekt.com worden ondersteund.",
    )
  }

  const match = /^\/decks\/(\d+)(?:\/[^/?#]+)?\/?$/.exec(url.pathname)
  const deckId = match?.[1]
  if (!deckId || deckId === "0") {
    throw new DeckImportError(
      "INVALID_URL",
      "De URL bevat geen geldig numeriek Archidekt deck-ID.",
    )
  }
  return deckId
}
