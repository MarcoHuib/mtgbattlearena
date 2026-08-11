import type { DeckSnapshot } from "@mtg/game-core/types"
import { createMemoryRepositories, deviceDeckOwnerId } from "./database"
import { createGame } from "@mtg/game-core/game"

const deck = (id: string): DeckSnapshot => ({
  id,
  schemaVersion: 1,
  source: "archidekt",
  sourceId: id,
  sourceUrl: `https://archidekt.com/decks/${id}`,
  sourceHash: `hash-${id}`,
  name: id,
  importedAt: "2026-07-29T20:00:00.000Z",
  cards: [],
  definitions: [],
})

test("scheidt lokale decklijsten per eigenaar", async () => {
  const repositories = createMemoryRepositories()
  await repositories.decks.save(deck("deck-a"), "user-a")
  await repositories.decks.save(deck("deck-b"), "user-b")

  expect(
    (await repositories.decks.list("user-a")).map(item => item.id),
  ).toEqual(["deck-a"])
  expect(
    (await repositories.decks.list("user-b")).map(item => item.id),
  ).toEqual(["deck-b"])
})

test("verwijdert alleen de koppeling van de huidige eigenaar", async () => {
  const repositories = createMemoryRepositories()
  const shared = deck("shared")
  await repositories.decks.save(shared, "user-a")
  await repositories.decks.save(shared, "user-b")

  await repositories.decks.delete(shared.id, "user-a")

  expect(await repositories.decks.list("user-a")).toEqual([])
  expect(await repositories.decks.list("user-b")).toEqual([shared])
  expect(await repositories.decks.get(shared.id)).toEqual(shared)
})

test("kan een oude apparaatimport veilig aan een account koppelen", async () => {
  const repositories = createMemoryRepositories()
  const legacyDeck = deck("legacy")
  await repositories.decks.save(legacyDeck)

  await repositories.decks.save(legacyDeck, "user-a")
  await repositories.decks.delete(legacyDeck.id, "device")

  expect(await repositories.decks.list("device")).toEqual([])
  expect(await repositories.decks.list("user-a")).toEqual([legacyDeck])
})

test("upsert een gewijzigde providerimport op intern ID zonder duplicaat", async () => {
  const repositories = createMemoryRepositories()
  const first = {
    ...deck("00000000-0000-4000-8000-000000000001"),
    sourceId: "24765444",
    sourceHash: "hash-a",
    name: "Primal Stampede",
  }
  await repositories.decks.save(first)
  await repositories.decks.save({
    ...first,
    sourceHash: "hash-b",
    importedAt: "2026-07-30T20:00:00.000Z",
    cards: [{ definitionId: "card", quantity: 101, isCommander: false }],
  })
  const records = await repositories.decks.list()
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({
    id: first.id,
    sourceHash: "hash-b",
    cards: [{ quantity: 101 }],
  })
})

test("verbergt oude content-ID duplicaten maar bewaart gerefereerde games", async () => {
  const repositories = createMemoryRepositories()
  const old = {
    ...deck("deck-archidekt-24765444-oldhash"),
    sourceId: "24765444",
    name: "Primal Stampede",
    cards: [{ definitionId: "old-card", quantity: 1, isCommander: false }],
    definitions: [
      {
        id: "old-card",
        name: "Old card",
        faces: [{ name: "Old card" }],
        imageRefs: [],
      },
    ],
  }
  const opponent = {
    ...deck("local-opponent"),
    source: "local" as const,
    sourceId: "local-opponent",
  }
  await repositories.decks.save(old)
  const game = createGame([old, opponent], {
    random: () => 0.5,
    createId: prefix => `${prefix}-id`,
    now: "2026-07-29T20:00:00.000Z",
  })
  await repositories.games.save({
    schemaVersion: 7,
    game,
    past: [],
    future: [],
    savedAt: game.updatedAt,
  })
  const current = {
    ...old,
    id: "00000000-0000-4000-8000-000000000001",
    sourceHash: "new-hash",
    cards: [{ definitionId: "new-card", quantity: 2, isCommander: false }],
    definitions: [
      {
        id: "new-card",
        name: "New card",
        faces: [{ name: "New card" }],
        imageRefs: [],
      },
    ],
  }
  await repositories.decks.save(current)
  expect(
    (await repositories.decks.list(deviceDeckOwnerId)).map(item => item.id),
  ).toEqual([current.id])
  expect(await repositories.decks.get(old.id)).not.toBeNull()
  expect(
    (await repositories.games.getLatest())?.game.cardDefinitionsById,
  ).toHaveProperty("player-1:old-card")
  expect(
    (await repositories.games.getLatest())?.game.cardDefinitionsById,
  ).not.toHaveProperty("player-1:new-card")
})

test("lokale decks met dezelfde sourceId blijven onafhankelijke records", async () => {
  const repositories = createMemoryRepositories()
  await repositories.decks.save({
    ...deck("local-a"),
    source: "local",
    sourceId: "manual",
  })
  await repositories.decks.save({
    ...deck("local-b"),
    source: "local",
    sourceId: "manual",
  })
  expect(await repositories.decks.list()).toHaveLength(2)
})
