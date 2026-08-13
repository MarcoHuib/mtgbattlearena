import { createDeckSnapshot } from "@mtg/game-core/decks"
import type {
  CloudDeckContent,
  CloudDeckMetadata,
  DeckSnapshot,
} from "@mtg/game-core/types"
import type { ImportedDeckWithId } from "../../app/api/importDeck"

export const createImportedDeckSnapshot = (imported: ImportedDeckWithId) =>
  createDeckSnapshot(imported, imported.revisionId, {
    deckSourceId: imported.id,
    revisionId: imported.revisionId,
  })

export const createCloudDeckSnapshot = (
  metadata: CloudDeckMetadata,
  content: CloudDeckContent,
): DeckSnapshot =>
  createDeckSnapshot(
    {
      source: metadata.provider,
      sourceId: metadata.externalDeckKey,
      sourceUrl: metadata.sourceUrl,
      name: metadata.name,
      ...(metadata.format ? { format: metadata.format } : {}),
      importedAt: content.importedAt,
      cards: content.cards,
      definitions: content.definitions,
    },
    `cloud:${metadata.deckKey}:${content.importedAt}`,
    {
      deckSourceId: metadata.deckKey,
      revisionId: content.importedAt,
    },
  )
