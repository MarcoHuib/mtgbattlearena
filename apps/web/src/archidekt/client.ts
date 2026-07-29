import type { ImportedDeck } from "@mtg/game-core/types"
import {
  deriveArchidektDeckExtras,
  extractArchidektTokenIds,
  normalizeArchidektDeck,
  normalizeArchidektTokens,
} from "./adapter"
import { DeckImportError } from "./errors"
import { parseArchidektDeckId } from "./url"

const IMPORT_BASE = "/api/import/archidekt"

const withUniqueDefinitions = (
  deck: ImportedDeck,
  definitions: ImportedDeck["definitions"],
): ImportedDeck => ({
  ...deck,
  definitions: [
    ...deck.definitions,
    ...definitions.filter(
      candidate =>
        !deck.definitions.some(definition => definition.id === candidate.id),
    ),
  ],
})

export type DeckImporter = (
  url: string,
  signal?: AbortSignal,
) => Promise<ImportedDeck>

export const importArchidektDeck: DeckImporter = async (url, signal) => {
  const deckId = parseArchidektDeckId(url)
  const timeoutController = new AbortController()
  const timeout = window.setTimeout(() => {
    timeoutController.abort()
  }, 12_000)
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal

  try {
    const response = await fetch(`${IMPORT_BASE}/${deckId}`, {
      headers: { Accept: "application/json" },
      signal: combinedSignal,
    })
    if (response.status === 404) {
      throw new DeckImportError(
        "NOT_FOUND",
        "Dit openbare Archidekt-deck is niet gevonden.",
      )
    }
    if (response.status === 401 || response.status === 403) {
      throw new DeckImportError(
        "PRIVATE_DECK",
        "Dit deck is privé of niet toegankelijk.",
      )
    }
    if (!response.ok) {
      throw new DeckImportError(
        "NETWORK",
        "Archidekt is nu niet bereikbaar. Probeer het later opnieuw.",
      )
    }
    const rawDeck: unknown = await response.json()
    const deck = normalizeArchidektDeck(rawDeck, deckId)
    const deckWithExtras = withUniqueDefinitions(
      deck,
      deriveArchidektDeckExtras(rawDeck),
    )
    const tokenIds = extractArchidektTokenIds(rawDeck)
    if (tokenIds.length === 0) return deckWithExtras

    try {
      const tokenResponse = await fetch(
        `${IMPORT_BASE}/tokens?ids=${encodeURIComponent(tokenIds.join(","))}`,
        {
          headers: { Accept: "application/json" },
          signal: combinedSignal,
        },
      )
      if (!tokenResponse.ok) {
        return deckWithExtras
      }
      const tokenDefinitions = normalizeArchidektTokens(
        await tokenResponse.json(),
      )
      return withUniqueDefinitions(deckWithExtras, tokenDefinitions)
    } catch (error) {
      if (combinedSignal.aborted) throw error
      return deckWithExtras
    }
  } catch (error) {
    if (error instanceof DeckImportError) {
      if (error.details) {
        console.warn("Archidekt-validatie:", error.details)
      }
      throw error
    }
    if (timeoutController.signal.aborted) {
      throw new DeckImportError(
        "TIMEOUT",
        "De import duurde te lang. Probeer het opnieuw.",
      )
    }
    throw new DeckImportError(
      "NETWORK",
      "Het deck kon niet worden opgehaald. Controleer je verbinding.",
    )
  } finally {
    window.clearTimeout(timeout)
  }
}
