import type {
  CloudDeckContent,
  CloudDeckMetadata,
  ImportedDeck,
} from "@mtg/game-core/types"
import {
  createCloudDeckSnapshot,
  createImportedDeckSnapshot,
} from "./deckSnapshots"

const imported: ImportedDeck = {
  source: "archidekt",
  sourceId: "12345",
  sourceUrl: "https://archidekt.com/decks/12345",
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
const identified = {
  ...imported,
  id: "00000000-0000-4000-8000-000000012345",
  revisionId: "10000000-0000-4000-8000-000000012345",
}

test("geeft een identieke Archidekt-import hetzelfde snapshot-ID", () => {
  const first = createImportedDeckSnapshot(identified)
  const duplicate = createImportedDeckSnapshot({
    ...identified,
    importedAt: "2026-07-30T20:00:00.000Z",
  })

  expect(duplicate.id).toBe(first.id)
  expect(duplicate.deckSourceId).toBe(identified.id)
})

test("geeft gewijzigde providerinhoud een nieuwe revision onder dezelfde source", () => {
  const first = createImportedDeckSnapshot(identified)
  const changed = createImportedDeckSnapshot({
    ...identified,
    revisionId: "20000000-0000-4000-8000-000000012345",
    cards: [{ definitionId: "card", quantity: 2, isCommander: false }],
  })

  expect(changed.id).not.toBe(first.id)
  expect(changed.deckSourceId).toBe(first.deckSourceId)
  expect(changed.cards[0]?.quantity).toBe(2)
})

test("maakt van authoritative cloudcontent een lokale immutable snapshot", () => {
  const metadata: CloudDeckMetadata = {
    deckKey: "archidekt-12345",
    provider: "archidekt",
    externalDeckKey: "12345",
    sourceUrl: imported.sourceUrl,
    name: imported.name,
    cardCount: 1,
    createdAt: imported.importedAt,
    updatedAt: imported.importedAt,
  }
  const content: CloudDeckContent = {
    deckKey: metadata.deckKey,
    importedAt: imported.importedAt,
    cards: imported.cards,
    definitions: imported.definitions,
  }

  const snapshot = createCloudDeckSnapshot(metadata, content)

  expect(snapshot.deckSourceId).toBe(metadata.deckKey)
  expect(snapshot.revisionId).toBe(content.importedAt)
  expect(snapshot.cards).toEqual(content.cards)
  expect(snapshot.definitions).toEqual(content.definitions)
})
