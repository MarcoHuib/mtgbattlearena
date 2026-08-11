import type { ImportedDeck } from "@mtg/game-core/types"
import { createImportedDeckSnapshot } from "./deckSnapshots"

const imported: ImportedDeck = {
  source: "archidekt",
  sourceId: "12345",
  sourceUrl: "https://archidekt.com/decks/12345",
  sourceHash: "fixture-hash",
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
const identified = { ...imported, id: "00000000-0000-4000-8000-000000012345" }

test("geeft een identieke Archidekt-import hetzelfde snapshot-ID", () => {
  const first = createImportedDeckSnapshot(identified)
  const duplicate = createImportedDeckSnapshot({
    ...identified,
    importedAt: "2026-07-30T20:00:00.000Z",
  })

  expect(duplicate.id).toBe(first.id)
})

test("behoudt het interne deck-ID wanneer providerinhoud wijzigt", () => {
  const first = createImportedDeckSnapshot(identified)
  const changed = createImportedDeckSnapshot({
    ...identified,
    cards: [{ definitionId: "card", quantity: 2, isCommander: false }],
  })

  expect(changed.id).toBe(first.id)
  expect(changed.cards[0]?.quantity).toBe(2)
})
