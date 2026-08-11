import type { DeckSnapshot } from "@mtg/game-core/types"
import {
  createMemoryRepositories,
  deviceDeckOwnerId,
  selectLatestDeckOwnerRevisionsForMigration,
} from "./database"
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
  expect(await repositories.decks.list("user-b")).toEqual([
    expect.objectContaining(shared),
  ])
  expect(await repositories.decks.get(shared.id)).toEqual(
    expect.objectContaining(shared),
  )
})

test("kan een oude apparaatimport veilig aan een account koppelen", async () => {
  const repositories = createMemoryRepositories()
  const legacyDeck = deck("legacy")
  await repositories.decks.save(legacyDeck)

  await repositories.decks.save(legacyDeck, "user-a")
  await repositories.decks.delete(legacyDeck.id, "device")

  expect(await repositories.decks.list("device")).toEqual([])
  expect(await repositories.decks.list("user-a")).toEqual([
    expect.objectContaining(legacyDeck),
  ])
})

test("houdt revisions per eigenaar geïsoleerd en upsert expliciet per source", async () => {
  const repositories = createMemoryRepositories()
  const first = {
    ...deck("revision-a"),
    deckSourceId: "00000000-0000-4000-8000-000000000001",
    revisionId: "revision-a",
    sourceId: "24765444",
    sourceHash: "hash-a",
    name: "Primal Stampede",
    cards: [{ definitionId: "card-a", quantity: 100, isCommander: false }],
  }
  const second = {
    ...first,
    id: "revision-b",
    revisionId: "revision-b",
    sourceHash: "hash-b",
    importedAt: "2026-07-30T20:00:00.000Z",
    cards: [{ definitionId: "card-b", quantity: 101, isCommander: false }],
  }
  await repositories.decks.save(first, "user-a")
  await repositories.decks.save(second, "user-b")
  expect(await repositories.decks.list("user-a")).toEqual([first])
  expect(await repositories.decks.list("user-b")).toEqual([second])
  expect((await repositories.decks.get(first.id))?.cards).toEqual(first.cards)

  await repositories.decks.save(second, "user-a")
  await repositories.decks.save(second, "user-a")
  expect(await repositories.decks.list("user-a")).toEqual([second])
  expect(await repositories.decks.list("user-b")).toEqual([second])
  expect(await repositories.decks.list("user-a")).toHaveLength(1)
})

test("v6-migratie kiest per owner/source alleen de recentste revision", () => {
  const first = {
    ...deck("revision-a"),
    deckSourceId: "source-24765444",
    revisionId: "revision-a",
    sourceId: "24765444",
    importedAt: "2026-07-29T20:00:00.000Z",
  }
  const second = {
    ...first,
    id: "revision-b",
    revisionId: "revision-b",
    sourceHash: "hash-b",
    importedAt: "2026-07-30T20:00:00.000Z",
  }
  const migrated = selectLatestDeckOwnerRevisionsForMigration(
    [first, second],
    [
      { key: "old-a", deckId: first.id, ownerId: "user-a" },
      { key: "old-b", deckId: second.id, ownerId: "user-a" },
      { key: "old-c", deckId: first.id, ownerId: "user-b" },
    ],
  )
  expect(migrated).toEqual([
    {
      key: "user-a::source-24765444",
      ownerId: "user-a",
      deckSourceId: "source-24765444",
      revisionId: "revision-b",
    },
    {
      key: "user-b::source-24765444",
      ownerId: "user-b",
      deckSourceId: "source-24765444",
      revisionId: "revision-a",
    },
  ])
  expect(
    selectLatestDeckOwnerRevisionsForMigration([first, second], migrated),
  ).toEqual(migrated)
})

test("één owner kan andere sources en providers onafhankelijk selecteren", async () => {
  const repositories = createMemoryRepositories()
  await repositories.decks.save(
    {
      ...deck("archidekt-revision"),
      sourceId: "24765444",
      deckSourceId: "archidekt-source",
      revisionId: "archidekt-revision",
    },
    "user-a",
  )
  await repositories.decks.save(
    {
      ...deck("other-archidekt-revision"),
      sourceId: "other",
      deckSourceId: "other-archidekt-source",
      revisionId: "other-archidekt-revision",
    },
    "user-a",
  )
  await repositories.decks.save(
    {
      ...deck("moxfield-revision"),
      source: "archidekt",
      sourceId: "24765444",
      deckSourceId: "moxfield-source",
      revisionId: "moxfield-revision",
    },
    "user-a",
  )
  expect(await repositories.decks.list("user-a")).toHaveLength(3)
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

test("bewaart null-stats van een Food-token in een deckrevision", async () => {
  const repositories = createMemoryRepositories()
  const revision = {
    ...deck("food-revision"),
    definitions: [
      {
        id: "food-token",
        name: "Food",
        faces: [{ name: "Food" }],
        imageRefs: [],
        token: {
          kind: "food" as const,
          name: "Food",
          power: null,
          toughness: null,
          source: "deck" as const,
        },
      },
    ],
  }
  await repositories.decks.save(revision, "food-owner")
  expect(
    (await repositories.decks.list("food-owner"))[0]?.definitions[0]?.token,
  ).toMatchObject({ kind: "food", power: null, toughness: null })
})
