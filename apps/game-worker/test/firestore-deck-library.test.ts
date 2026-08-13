import {
  cloudDeckKey,
  recordFromImportedDeck,
} from "../src/firestore-deck-library"
import { createFirestoreLibrary, refreshRegisteredDecks } from "../src/index"
import type { Env } from "../src/types"

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
        imageRefs: [
          {
            resolver: 1,
            imageId: "00000000-0000-4000-8000-000000000001",
            faceIndex: 0,
            variant: "normal",
          },
        ],
        colorIdentity: ["W", "U", "B", "G"],
      },
    ],
  })
  expect(record.metadata).toMatchObject({
    externalDeckKey: "42",
    commanderSummary: "Atraxa",
    thumbnailImageRef: {
      imageId: "00000000-0000-4000-8000-000000000001",
    },
    colorIdentity: ["W", "U", "B", "G"],
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

test("Firestore Emulator kan uitsluitend expliciet in development worden gebruikt", () => {
  expect(() =>
    createFirestoreLibrary({
      APP_ENV: "production",
      FIREBASE_PROJECT_ID: "mtgbattlearena",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    } as Env),
  ).toThrow("Deckopslag is niet geconfigureerd.")
  expect(() =>
    createFirestoreLibrary({
      APP_ENV: "development",
      FIREBASE_PROJECT_ID: "mtgbattlearena",
      FIRESTORE_EMULATOR_HOST: "firestore.example.com:8080",
    } as Env),
  ).toThrow("Deckopslag is niet geconfigureerd.")
  expect(() =>
    createFirestoreLibrary({
      APP_ENV: "development",
      FIREBASE_PROJECT_ID: "mtgbattlearena",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    } as Env),
  ).not.toThrow()
})
