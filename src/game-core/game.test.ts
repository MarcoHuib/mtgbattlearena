import { archidektFixture } from "../archidekt/fixtures"
import { normalizeArchidektDeck } from "../archidekt/adapter"
import { createDeckSnapshot } from "./decks"
import {
  advanceTurn,
  changePlayerLife,
  createGame,
  keepOpeningHand,
  moveCard,
  mulliganOpeningHand,
  setCardCounter,
  shuffle,
  toggleCardTapped,
} from "./game"

const makeGame = () => {
  const imported = normalizeArchidektDeck(
    archidektFixture,
    "12345",
    "2026-01-01T00:00:00.000Z",
  )
  const first = createDeckSnapshot(imported, "deck-one")
  const second = createDeckSnapshot(
    { ...imported, name: "Second Deck" },
    "deck-two",
  )
  let id = 0
  return createGame([first, second], {
    random: () => 0.5,
    createId: prefix => `${prefix}-${(id += 1)}`,
    now: "2026-01-01T00:00:00.000Z",
  })
}

describe("game-core", () => {
  it("schudt deterministisch met een injecteerbare randombron", () => {
    expect(shuffle([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1])
  })

  it("maakt unieke instances, zet commanders apart en trekt zeven", () => {
    const game = makeGame()
    expect(Object.keys(game.cardsById)).toHaveLength(26)
    expect(game.players["player-1"].zones.command).toHaveLength(1)
    expect(game.players["player-1"].zones.hand).toHaveLength(7)
    expect(game.players["player-1"].zones.library).toHaveLength(5)
    expect(new Set(Object.keys(game.cardsById)).size).toBe(26)
  })

  it("verplaatst, tapt en verandert leven zonder de invoer te muteren", () => {
    const game = makeGame()
    const cardId = game.players["player-1"].zones.hand[0]!
    const untouchedCardId = game.players["player-1"].zones.hand[1]!
    const moved = moveCard(
      game,
      cardId,
      "player-1",
      "battlefield",
      { x: 0.5, y: 0.5, z: 1 },
      "2026-01-02T00:00:00.000Z",
    )
    const tapped = toggleCardTapped(moved, cardId)
    const life = changePlayerLife(tapped, "player-1", -3)

    expect(game.players["player-1"].zones.hand).toContain(cardId)
    expect(moved.players["player-1"].zones.battlefield).toContain(cardId)
    expect(moved.cardsById[cardId]?.position).toEqual({
      x: 0.5,
      y: 0.5,
      z: 1,
    })
    expect(moved.cardDefinitionsById).toBe(game.cardDefinitionsById)
    expect(moved.cardsById[untouchedCardId]).toBe(
      game.cardsById[untouchedCardId],
    )
    expect(moved.cardsById[cardId]).not.toBe(game.cardsById[cardId])
    expect(tapped.cardsById[cardId]?.tapped).toBe(true)
    expect(life.players["player-1"].life).toBe(37)
  })

  it("verwijdert een battlefieldpositie wanneer de kaart de tafel verlaat", () => {
    const game = makeGame()
    const cardId = game.players["player-1"].zones.hand[0]!
    const onBattlefield = moveCard(game, cardId, "player-1", "battlefield", {
      x: 0.8,
      y: 0.25,
      z: 3,
    })
    const inGraveyard = moveCard(onBattlefield, cardId, "player-1", "graveyard")

    expect(inGraveyard.cardsById[cardId]?.position).toBeUndefined()
  })

  it("wisselt de actieve speler, untapt diens kaarten en trekt automatisch", () => {
    const game = makeGame()
    const cardId = game.players["player-2"].zones.hand[0]!
    const onBattlefield = moveCard(game, cardId, "player-2", "battlefield")
    const tapped = toggleCardTapped(onBattlefield, cardId)
    const next = advanceTurn(tapped, "2026-01-02T00:00:00.000Z")

    expect(next.activePlayerId).toBe("player-2")
    expect(next.turnNumber).toBe(2)
    expect(next.cardsById[cardId]?.tapped).toBe(false)
    expect(next.players["player-2"].zones.hand).toHaveLength(7)
    expect(next.players["player-2"].zones.library).toHaveLength(4)
  })

  it("voegt counters toe en verwijdert ze weer bij nul", () => {
    const game = makeGame()
    const cardId = game.players["player-1"].zones.hand[0]!
    const withCounters = setCardCounter(game, cardId, "+1/+1", 2)
    const withoutCounters = setCardCounter(withCounters, cardId, "+1/+1", 0)

    expect(withCounters.cardsById[cardId]?.counters["+1/+1"]).toBe(2)
    expect(withoutCounters.cardsById[cardId]?.counters["+1/+1"]).toBeUndefined()
  })

  it("past de vrije mulligans onafhankelijk per speler toe", () => {
    const initial = makeGame()
    const first = mulliganOpeningHand(initial, "player-1", () => 0.4)
    const second = mulliganOpeningHand(first, "player-1", () => 0.4)
    const third = mulliganOpeningHand(second, "player-1", () => 0.4)
    const fourth = mulliganOpeningHand(third, "player-1", () => 0.4)

    expect(first.players["player-1"].zones.hand).toHaveLength(7)
    expect(second.players["player-1"].zones.hand).toHaveLength(7)
    expect(third.players["player-1"].zones.hand).toHaveLength(6)
    expect(fourth.players["player-1"].zones.hand).toHaveLength(5)
    expect(fourth.openingHands["player-1"].mulliganCount).toBe(4)
    expect(fourth.players["player-2"].zones.hand).toHaveLength(7)
    expect(fourth.openingHands["player-2"].mulliganCount).toBe(0)

    const kept = keepOpeningHand(fourth, "player-1")
    expect(mulliganOpeningHand(kept, "player-1", () => 0.4)).toBe(kept)
  })
})
