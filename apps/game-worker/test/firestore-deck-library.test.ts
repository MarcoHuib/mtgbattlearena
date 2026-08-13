import {
  cloudDeckKey,
  recordFromImportedDeck,
} from "../src/firestore-deck-library"
import { refreshRegisteredDecks } from "../src/index"

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

test("ververst geregistreerde decks owner-scoped voor game-initialisatie", async () => {
  const get = vi.fn().mockImplementation((uid: string, deckKey: string) =>
    Promise.resolve({
      metadata: {
        deckKey,
        provider: "archidekt",
        externalDeckKey: uid === "owner-a" ? "42" : "84",
        sourceUrl: `https://archidekt.com/decks/${uid === "owner-a" ? "42" : "84"}`,
        name: `Vers deck ${uid}`,
        cardCount: 1,
        createdAt: "2026-08-13T10:00:00.000Z",
        updatedAt: "2026-08-13T11:00:00.000Z",
      },
      content: {
        deckKey,
        cards: [{ definitionId: `fresh-${uid}`, quantity: 1 }],
        definitions: [
          {
            id: `fresh-${uid}`,
            name: `Fresh ${uid}`,
            faces: [{ name: `Fresh ${uid}` }],
            imageRefs: [],
          },
        ],
        importedAt: "2026-08-13T11:00:00.000Z",
      },
    }),
  )
  const seed = await refreshRegisteredDecks(
    {
      gameId: "game-1",
      title: "Owner check",
      players: [
        {
          playerId: "player-a",
          uid: "owner-a",
          displayName: "A",
          deckSnapshotId: "cloud:archidekt_NDI:old",
          deckName: "Oud",
        },
        {
          playerId: "player-b",
          uid: "owner-b",
          displayName: "B",
          deckSnapshotId: "cloud:archidekt_ODQ:old",
          deckName: "Oud",
        },
      ],
    },
    { get },
  )

  expect(get.mock.calls).toEqual([
    ["owner-a", "archidekt_NDI"],
    ["owner-b", "archidekt_ODQ"],
  ])
  expect(seed.players[0]?.cards[0]?.definitionId).toBe("fresh-owner-a")
  expect(seed.players[1]?.cards[0]?.definitionId).toBe("fresh-owner-b")
})
