import { expect, test } from "vitest"
import {
  createAuthoritativeGame,
  migrateAuthoritativeGame,
  serializePersonalSnapshot,
  type AuthoritativeGameState,
} from "../src/game-server-adapter"

const forest = "d232fcc2-12f6-401a-b1aa-ddff11cb9378"

const seed = {
  gameId: "legacy-image-game",
  title: "Legacy images",
  players: ["one", "two"].map(playerId => ({
    playerId,
    uid: `uid-${playerId}`,
    displayName: playerId,
    deckSnapshotId: `deck-${playerId}`,
    deckName: playerId,
    cards: [
      {
        definitionId: `forest-${playerId}`,
        name: "Forest",
        imageRefs: [],
        quantity: 7,
        isCommander: false,
      },
    ],
    tokens: [],
  })),
}

test("authoritative v5 migration restores legacy images without gameplay changes", () => {
  let nextId = 0
  const current = createAuthoritativeGame(seed, {
    now: () => "2026-01-01T00:00:00.000Z",
    random: () => 0.5,
    createId: prefix => `${prefix}-${++nextId}`,
  })
  const definitionId = Object.keys(current.cardDefinitionsById).find(id =>
    id.startsWith("one:"),
  )!
  const legacy = {
    ...structuredClone(current),
    schemaVersion: 5,
  } as unknown as AuthoritativeGameState
  legacy.cardDefinitionsById[definitionId]!.imageRefs = [
    {
      assetKey: `${forest}:0:normal`,
      faceIndex: 0,
      variant: "normal",
      url: "https://card-images.archidekt.com/ignored.jpg",
    },
  ]

  const migrated = migrateAuthoritativeGame(legacy)
  const twice = migrateAuthoritativeGame(migrated)
  expect(migrated.schemaVersion).toBe(6)
  expect(migrated.cardDefinitionsById[definitionId]!.imageRefs).toEqual([
    { resolver: 1, imageId: forest, faceIndex: 0, variant: "normal" },
  ])
  expect(twice).toEqual(migrated)
  expect({ ...migrated, schemaVersion: 5, cardDefinitionsById: {} }).toEqual({
    ...legacy,
    cardDefinitionsById: {},
  })

  const snapshot = serializePersonalSnapshot(migrated, {
    gameId: migrated.gameId,
    uid: "uid-one",
    playerId: "one",
    role: "player",
    isHost: true,
  })
  const visible = (snapshot.privateView?.hand ?? []).find(
    item => item.name === "Forest",
  )
  expect(visible?.imageRef).toEqual({
    resolver: 1,
    imageId: forest,
    faceIndex: 0,
    variant: "normal",
  })
})
