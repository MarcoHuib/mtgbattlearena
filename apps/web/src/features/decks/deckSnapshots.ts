import { createDeckSnapshot } from "@mtg/game-core/decks"
import type { ImportedDeckWithId } from "../../app/api/importDeck"

export const createImportedDeckSnapshot = (imported: ImportedDeckWithId) =>
  createDeckSnapshot(imported, imported.id)
