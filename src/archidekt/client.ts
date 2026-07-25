import type { ImportedDeck } from "../game-core/types"
import { normalizeArchidektDeck } from "./adapter"
import { DeckImportError } from "./errors"
import { parseArchidektDeckId } from "./url"

const IMPORT_BASE = "/api/import/archidekt"

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
    return normalizeArchidektDeck(await response.json(), deckId)
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
