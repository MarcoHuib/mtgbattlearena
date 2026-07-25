import { archidektFixture } from "../archidekt/fixtures"
import { normalizeArchidektDeck } from "../archidekt/adapter"
import { createDeckSnapshot } from "./decks"
import {
  advancePhase,
  advanceTurn,
  changeCommanderDamage,
  changeCommanderTax,
  changePlayerLife,
  changePlayerPoison,
  createGame,
  createToken,
  duplicateToken,
  keepOpeningHand,
  millCards,
  moveCard,
  moveCards,
  mulliganOpeningHand,
  setCardCounter,
  setCardStackOrder,
  shuffle,
  shuffleLibrary,
  switchCardFace,
  toggleCardTapped,
  untapAllCards,
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

  it("verplaatst centraal en zonder duplicaten tussen alle ondersteunde zones", () => {
    const initial = makeGame()
    const cardId = initial.players["player-1"].zones.hand[0]!
    const zones = [
      "battlefield",
      "graveyard",
      "exile",
      "command",
      "library",
      "hand",
    ] as const
    const moved = zones.reduce(
      (game, zone) => moveCard(game, cardId, "player-1", zone),
      initial,
    )
    const occurrences = Object.values(moved.players)
      .flatMap(player => Object.values(player.zones))
      .flat()
      .filter(instanceId => instanceId === cardId)

    expect(occurrences).toHaveLength(1)
    expect(moved.players["player-1"].zones.hand).toContain(cardId)
    expect(moved.cardsById[cardId]?.zone).toBe("hand")
    expect(moved.players["player-1"].commanderTax[cardId]).toBe(0)
  })

  it("verplaatst meerdere kaarten als één handeling met vrije posities", () => {
    const initial = makeGame()
    const [first, second] = initial.players["player-1"].zones.hand
    const moved = moveCards(initial, [
      {
        instanceId: first!,
        playerId: "player-1",
        zone: "battlefield",
        position: { x: 0.2, y: 0.3, z: 1 },
      },
      {
        instanceId: second!,
        playerId: "player-1",
        zone: "battlefield",
        position: { x: 0.7, y: 0.8, z: 2 },
      },
    ])

    expect(moved.players["player-1"].zones.battlefield).toEqual([first, second])
    expect(moved.cardsById[first!]?.position).toEqual({
      x: 0.2,
      y: 0.3,
      z: 1,
    })
    expect(moved.cardsById[second!]?.position).toEqual({
      x: 0.7,
      y: 0.8,
      z: 2,
    })
  })

  it("wisselt kaartzijde en kan battlefieldkaarten naar voren en achteren zetten", () => {
    const initial = makeGame()
    const cardId = initial.players["player-1"].zones.hand[0]!
    const card = initial.cardsById[cardId]!
    const definition = initial.cardDefinitionsById[card.definitionId]!
    const withBackFace = {
      ...initial,
      cardDefinitionsById: {
        ...initial.cardDefinitionsById,
        [definition.id]: {
          ...definition,
          faces: [...definition.faces, { name: "Achterzijde" }],
        },
      },
    }
    const onBattlefield = moveCard(
      withBackFace,
      cardId,
      "player-1",
      "battlefield",
      { x: 0.4, y: 0.4, z: 4 },
    )
    const backFace = switchCardFace(onBattlefield, cardId)
    const behind = setCardStackOrder(backFace, cardId, "back")
    const inFront = setCardStackOrder(behind, cardId, "front")

    expect(backFace.cardsById[cardId]?.activeFaceIndex).toBe(1)
    expect(behind.cardsById[cardId]?.position?.z).toBe(0)
    expect(inFront.cardsById[cardId]?.position?.z).toBeGreaterThan(0)
  })

  it("millt, schudt testbaar, untapt alles en doorloopt fases", () => {
    const initial = makeGame()
    const cardId = initial.players["player-1"].zones.hand[0]!
    const tapped = toggleCardTapped(
      moveCard(initial, cardId, "player-1", "battlefield"),
      cardId,
    )
    const milled = millCards(tapped, "player-1", 2)
    const beforeShuffle = milled.players["player-1"].zones.library
    const shuffled = shuffleLibrary(milled, "player-1", () => 0)
    const untapped = untapAllCards(shuffled, "player-1")
    const nextPhase = advancePhase(untapped)

    expect(milled.players["player-1"].zones.graveyard).toHaveLength(2)
    expect(shuffled.players["player-1"].zones.library).not.toEqual(
      beforeShuffle,
    )
    expect(untapped.cardsById[cardId]?.tapped).toBe(false)
    expect(nextPhase.phase).toBe("precombat-main")
  })

  it("houdt poison, commander tax en commander damage per commander bij", () => {
    const initial = makeGame()
    const commanderId = initial.players["player-1"].zones.command[0]!
    const poisoned = changePlayerPoison(initial, "player-2", 3)
    const taxed = changeCommanderTax(poisoned, "player-1", commanderId, 2)
    const damaged = changeCommanderDamage(taxed, "player-2", commanderId, 7)

    expect(damaged.players["player-2"].poison).toBe(3)
    expect(damaged.players["player-1"].commanderTax[commanderId]).toBe(2)
    expect(damaged.players["player-2"].commanderDamage[commanderId]).toBe(7)
  })

  it("ondersteunt twee commanders onafhankelijk", () => {
    const imported = normalizeArchidektDeck(archidektFixture, "12345")
    const entries = imported.cards.map((entry, index) => ({
      ...entry,
      isCommander: index < 2,
    }))
    const deck = createDeckSnapshot(
      { ...imported, cards: entries },
      "partner-deck",
    )
    let id = 0
    const game = createGame([deck, deck], {
      random: () => 0.5,
      createId: prefix => `${prefix}-${(id += 1)}`,
      now: "2026-01-01T00:00:00.000Z",
    })

    expect(game.players["player-1"].zones.command).toHaveLength(2)
    expect(Object.keys(game.players["player-1"].commanderTax)).toHaveLength(2)
  })

  it.each([
    ["creature", "Goblin", 1, 1],
    ["treasure", "Treasure", undefined, undefined],
    ["food", "Food", undefined, undefined],
    ["clue", "Clue", undefined, undefined],
    ["copy", "Copy", 3, 3],
  ] as const)(
    "maakt en dupliceert een functionele %s-token",
    (kind, name, power, toughness) => {
      const initial = makeGame()
      let id = 0
      const withToken = createToken(initial, {
        playerId: "player-1",
        kind,
        name,
        power,
        toughness,
        createId: prefix => `${prefix}-${(id += 1)}`,
      })
      const tokenId = withToken.players["player-1"].zones.battlefield[0]!
      const definition =
        withToken.cardDefinitionsById[
          withToken.cardsById[tokenId]!.definitionId
        ]!
      const duplicated = duplicateToken(withToken, tokenId, () => "token-copy")

      expect(definition.token).toMatchObject({ kind, name })
      expect(definition.imageRefs).toEqual([])
      expect(duplicated.players["player-1"].zones.battlefield).toContain(
        "token-copy",
      )
    },
  )
})
