import type { ImportedDeck } from "@mtg/game-core/types"
import { createImportedDeckSnapshot } from "./deckSnapshots"

const imported: ImportedDeck = {
  source: "archidekt",
  sourceDeckId: "12345",
  name: "Mijn deck",
  importedAt: "2026-07-29T20:00:00.000Z",
  cards: [{ definitionId: "card", quantity: 1, isCommander: false }],
  definitions: [
    {
      id: "card",
      name: "Command Tower",
      faces: [{ name: "Command Tower" }],
      imageRefs: [],
    },
  ],
}

test("geeft een identieke Archidekt-import hetzelfde snapshot-ID", () => {
  const first = createImportedDeckSnapshot(imported)
  const duplicate = createImportedDeckSnapshot({
    ...imported,
    importedAt: "2026-07-30T20:00:00.000Z",
  })

  expect(duplicate.id).toBe(first.id)
})

test("maakt bij gewijzigde deckinhoud een nieuw immutable snapshot", () => {
  const first = createImportedDeckSnapshot(imported)
  const changed = createImportedDeckSnapshot({
    ...imported,
    cards: [{ definitionId: "card", quantity: 2, isCommander: false }],
  })

  expect(changed.id).not.toBe(first.id)
})
