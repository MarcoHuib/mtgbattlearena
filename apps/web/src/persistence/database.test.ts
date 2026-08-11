import type { DeckSnapshot } from "@mtg/game-core/types"
import { createMemoryRepositories } from "./database"

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
