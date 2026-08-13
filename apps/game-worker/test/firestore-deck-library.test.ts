import {
  cloudDeckKey,
  recordFromImportedDeck,
} from "../src/firestore-deck-library"

test("deckKey is deterministisch, Firestore-veilig en inhoudsonafhankelijk", () => {
  expect(cloudDeckKey("archidekt", "42")).toBe(cloudDeckKey("archidekt", "42"))
  expect(cloudDeckKey("archidekt", "42")).not.toContain("/")
  expect(cloudDeckKey("archidekt", "43")).not.toBe(
    cloudDeckKey("archidekt", "42"),
  )
})

test("splitst kleine lijstmetadata van provider-neutrale content", () => {
  const record = recordFromImportedDeck({
    source: "archidekt",
    sourceId: "42",
    sourceUrl: "https://archidekt.com/decks/42",
    name: "Commander",
    format: "Commander",
    importedAt: "2026-08-13T10:00:00.000Z",
    cards: [{ definitionId: "commander", quantity: 1, isCommander: true }],
    definitions: [
      {
        id: "commander",
        name: "Atraxa",
        faces: [{ name: "Atraxa" }],
        imageRefs: [],
      },
    ],
  })
  expect(record.metadata).toMatchObject({
    externalDeckKey: "42",
    commanderSummary: "Atraxa",
    cardCount: 1,
  })
  expect(record.metadata).not.toHaveProperty("cards")
  expect(record.content.cards).toHaveLength(1)
})
