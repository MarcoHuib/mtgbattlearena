import { createDeckSnapshot } from "@mtg/game-core/decks"
import type { ImportedDeck } from "@mtg/game-core/types"

const fingerprint = (value: string): string => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export const createImportedDeckSnapshot = (imported: ImportedDeck) => {
  const content = JSON.stringify({
    sourceDeckId: imported.sourceDeckId,
    cards: imported.cards,
    definitions: imported.definitions,
  })
  return createDeckSnapshot(
    imported,
    `deck-${imported.sourceDeckId}-${fingerprint(content)}`,
  )
}
