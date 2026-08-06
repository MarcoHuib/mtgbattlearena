import { createDeckSnapshot } from "./decks"
import {
  addCardsToGroup,
  advancePhase,
  advanceTurn,
  applyFirstPlayerRoll,
  attachCard,
  changeCommanderDamage,
  changeCommanderTax,
  changePlayerLife,
  changePlayerPoison,
  changePlayerTracker,
  createGame,
  createGameForPlayers,
  createFirstPlayerRollState,
  createCardGroup,
  createKnownToken,
  createToken,
  detachCard,
  dissolveCardGroup,
  duplicateToken,
  keepOpeningHand,
  getPlayerWarnings,
  millCards,
  moveCard,
  moveCardGroup,
  moveCardToLibraryPosition,
  moveCards,
  mulliganOpeningHand,
  openingHandKeepCount,
  removeCardsFromGroup,
  resolveFirstPlayerRoll,
  setCardCounter,
  setCardStackOrder,
  setDayNightStatus,
  setInitiativeHolder,
  setMonarchHolder,
  setPlayerCitysBlessing,
  setPlayerDisabled,
  setPlayerTrackerVisibility,
  shuffle,
  shuffleLibrary,
  switchCardFace,
  toggleCardTapped,
  topLibraryCards,
  untapAllCards,
  updateCardGroup,
} from "./game"
import type { CardDefinition, ImportedDeck } from "./types"

const importedDeck: ImportedDeck = {
  source: "archidekt",
  sourceDeckId: "12345",
  name: "Verdant Resolve",
  importedAt: "2026-01-01T00:00:00.000Z",
  cards: [
    { definitionId: "commander-1", quantity: 1, isCommander: true },
    ...Array.from({ length: 12 }, (_, index) => ({
      definitionId: `card-${index + 1}`,
      quantity: 1,
      isCommander: false,
    })),
  ],
  definitions: [
    {
      id: "commander-1",
      name: "Aesi, Tyrant of Gyre Strait",
      typeLine: "Legendary Creature — Serpent",
      faces: [{ name: "Aesi, Tyrant of Gyre Strait" }],
      imageRefs: [],
    },
    ...Array.from({ length: 12 }, (_, index) => ({
      id: `card-${index + 1}`,
      name: `Forest Memory ${index + 1}`,
      typeLine: index % 2 === 0 ? "Land" : "Creature",
      faces: [{ name: `Forest Memory ${index + 1}` }],
      imageRefs: [],
    })),
  ],
}

const knownTokenDefinition: CardDefinition = {
  id: "token-treasure",
  name: "Treasure",
  typeLine: "Token Artifact — Treasure",
  faces: [{ name: "Treasure" }],
  imageRefs: [
    {
      assetKey: "token-treasure:0:normal",
      faceIndex: 0,
      variant: "normal",
      url: "https://card-images.archidekt.com/normal/front/f/9/f909bd95-58a1-4299-9570-87724145fc85.jpg?1783902798",
    },
  ],
  token: {
    kind: "treasure",
    name: "Treasure",
    source: "deck",
  },
}

const makeGame = () => {
  const first = createDeckSnapshot(importedDeck, "deck-one")
  const second = createDeckSnapshot(
    { ...importedDeck, name: "Second Deck" },
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
  it("maakt een complete offline game met zes dynamische spelers", () => {
    const deck = createDeckSnapshot(importedDeck, "shared-deck")
    let id = 0
    const game = createGameForPlayers(
      Array.from({ length: 6 }, (_, index) => ({
        id: `seat-${index + 1}`,
        name: `Speler ${index + 1}`,
        deck: { ...deck, id: `deck-${index + 1}` },
      })),
      {
        random: () => 0.5,
        createId: prefix => `${prefix}-${(id += 1)}`,
        now: "2026-07-31T08:00:00.000Z",
      },
    )

    expect(Object.keys(game.players)).toEqual([
      "seat-1",
      "seat-2",
      "seat-3",
      "seat-4",
      "seat-5",
      "seat-6",
    ])
    expect(game.firstPlayerRoll.participantIds).toHaveLength(6)
    expect(Object.keys(game.openingHands)).toHaveLength(6)
    expect(
      Object.values(game.players).every(
        player => player.zones.hand.length === 7,
      ),
    ).toBe(true)
    expect(game.deckSnapshotIds).toHaveLength(6)
  })

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
    expect(next.turnNumber).toBe(1)
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
    expect(
      Array.from({ length: 8 }, (_, count) => openingHandKeepCount(count)),
    ).toEqual([7, 7, 6, 5, 4, 3, 2, 1])
    const initial = makeGame()
    const first = mulliganOpeningHand(initial, "player-1", () => 0.4)
    const second = mulliganOpeningHand(first, "player-1", () => 0.4)
    const third = mulliganOpeningHand(second, "player-1", () => 0.4)
    const fourth = mulliganOpeningHand(third, "player-1", () => 0.4)

    expect(first.players["player-1"].zones.hand).toHaveLength(7)
    expect(second.players["player-1"].zones.hand).toHaveLength(7)
    expect(third.players["player-1"].zones.hand).toHaveLength(7)
    expect(fourth.players["player-1"].zones.hand).toHaveLength(7)
    expect(fourth.openingHands["player-1"].mulliganCount).toBe(4)
    expect(fourth.players["player-2"].zones.hand).toHaveLength(7)
    expect(fourth.openingHands["player-2"].mulliganCount).toBe(0)

    expect(keepOpeningHand(fourth, "player-1")).toBe(fourth)
    const cardsForBottom = fourth.players["player-1"].zones.hand.slice(0, 3)
    const kept = keepOpeningHand(fourth, "player-1", cardsForBottom)
    expect(kept.players["player-1"].zones.hand).toHaveLength(4)
    expect(kept.players["player-1"].zones.library.slice(0, 3)).toEqual(
      cardsForBottom,
    )
    expect(
      cardsForBottom.every(
        instanceId => kept.cardsById[instanceId]?.zone === "library",
      ),
    ).toBe(true)
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
    const attachmentTargetId = initial.players["player-1"].zones.hand[1]!
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
    const preservedCard = {
      ...onBattlefield.cardsById[cardId]!,
      tapped: true,
      counters: { bloodline: 2 },
      attachedTo: attachmentTargetId,
    }
    const prepared = {
      ...onBattlefield,
      cardsById: {
        ...onBattlefield.cardsById,
        [cardId]: preservedCard,
      },
    }
    const backFace = switchCardFace(prepared, cardId)
    const frontFace = switchCardFace(backFace, cardId)
    const behind = setCardStackOrder(backFace, cardId, "back")
    const inFront = setCardStackOrder(behind, cardId, "front")

    expect(backFace.cardsById[cardId]?.activeFaceIndex).toBe(1)
    expect(backFace.cardsById[cardId]).toMatchObject({
      instanceId: cardId,
      ownerId: preservedCard.ownerId,
      controllerId: preservedCard.controllerId,
      tapped: true,
      counters: { bloodline: 2 },
      attachedTo: attachmentTargetId,
      position: preservedCard.position,
    })
    expect(frontFace.cardsById[cardId]?.activeFaceIndex).toBe(0)
    expect(behind.cardsById[cardId]?.position?.z).toBe(0)
    expect(inFront.cardsById[cardId]?.position?.z).toBeGreaterThan(0)
  })

  it("draait geen kaart buiten het battlefield of enkelzijdige kaart om", () => {
    const initial = makeGame()
    const cardId = initial.players["player-1"].zones.hand[0]!
    expect(switchCardFace(initial, cardId)).toBe(initial)

    const onBattlefield = moveCard(initial, cardId, "player-1", "battlefield")
    expect(switchCardFace(onBattlefield, cardId)).toBe(onBattlefield)
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

  it("beheert optionele spelertrackers en handmatige spelerstatussen", () => {
    const initial = makeGame()
    const visible = setPlayerTrackerVisibility(
      initial,
      "player-1",
      "energy",
      true,
    )
    const tracked = changePlayerTracker(visible, "player-1", "energy", 3)
    const blessed = setPlayerCitysBlessing(tracked, "player-1", true)
    const disabled = setPlayerDisabled(blessed, "player-1", true)

    expect(disabled.players["player-1"]).toMatchObject({
      trackers: { energy: 3, experience: 0, rad: 0 },
      visibleTrackers: { energy: true, experience: false, rad: false },
      citysBlessing: true,
      disabled: true,
    })
    expect(
      changePlayerTracker(disabled, "player-1", "energy", -99).players[
        "player-1"
      ].trackers.energy,
    ).toBe(0)
  })

  it("houdt Monarch, Initiative en Day/Night eenmaal centraal bij", () => {
    const initial = makeGame()
    const firstMonarch = setMonarchHolder(initial, "player-1")
    const secondMonarch = setMonarchHolder(firstMonarch, "player-2")
    const initiative = setInitiativeHolder(secondMonarch, "player-1")
    const night = setDayNightStatus(initiative, "night")

    expect(night.matchStatus).toEqual({
      monarchPlayerId: "player-2",
      initiativePlayerId: "player-1",
      dayNight: "night",
    })
  })

  it("signaleert alleen de drie verliesdrempels zonder een speler uit te schakelen", () => {
    const initial = makeGame()
    const opponentCommander = initial.players["player-2"].zones.command[0]!
    const lowLife = changePlayerLife(initial, "player-1", -40)
    const poisoned = changePlayerPoison(lowLife, "player-1", 10)
    const damaged = changeCommanderDamage(
      poisoned,
      "player-1",
      opponentCommander,
      21,
    )

    expect(getPlayerWarnings(damaged, "player-1")).toEqual([
      "life",
      "poison",
      "commander-damage",
    ])
    expect(damaged.players["player-1"].disabled).toBe(false)
    expect(getPlayerWarnings(initial, "player-1")).toEqual([])
  })

  it("ondersteunt twee commanders onafhankelijk", () => {
    const entries = importedDeck.cards.map((entry, index) => ({
      ...entry,
      isCommander: index < 2,
    }))
    const deck = createDeckSnapshot(
      { ...importedDeck, cards: entries },
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

  it("maakt een bekend decktoken met dezelfde definitie en afbeelding", () => {
    const definitions = [...importedDeck.definitions, knownTokenDefinition]
    const deck = createDeckSnapshot({ ...importedDeck, definitions }, "tokens")
    let id = 0
    const initial = createGame([deck, deck], {
      random: () => 0.5,
      createId: prefix => `${prefix}-${(id += 1)}`,
      now: "2026-01-01T00:00:00.000Z",
    })
    const definition = Object.values(initial.cardDefinitionsById).find(
      item => item.id.startsWith("player-1:") && item.token?.source === "deck",
    )!
    const withToken = createKnownToken(initial, {
      playerId: "player-1",
      definitionId: definition.id,
      instanceId: "known-token",
      position: { x: 0.25, y: 0.75, z: 4 },
    })

    expect(withToken.cardsById["known-token"]).toMatchObject({
      definitionId: definition.id,
      zone: "battlefield",
      position: { x: 0.25, y: 0.75, z: 4 },
    })
    expect(
      withToken.cardDefinitionsById[definition.id]?.imageRefs[0]?.url,
    ).toBe(
      "https://card-images.archidekt.com/normal/front/f/9/f909bd95-58a1-4299-9570-87724145fc85.jpg?1783902798",
    )
  })

  it("bekijkt top-X en plaatst kaarten expliciet boven- of onderop", () => {
    const initial = makeGame()
    const library = initial.players["player-1"].zones.library
    expect(topLibraryCards(initial, "player-1", 2)).toEqual(
      library.slice(-2).reverse(),
    )
    const cardId = initial.players["player-1"].zones.hand[0]!
    const onTop = moveCardToLibraryPosition(initial, cardId, "player-1", "top")
    expect(onTop.players["player-1"].zones.library.at(-1)).toBe(cardId)
    const onBottom = moveCardToLibraryPosition(
      onTop,
      cardId,
      "player-1",
      "bottom",
    )
    expect(onBottom.players["player-1"].zones.library[0]).toBe(cardId)
  })

  it("maakt, wijzigt en verwijdert attachments zonder cycli", () => {
    const initial = makeGame()
    const [first, second, third] = initial.players["player-1"].zones.hand
    const battlefield = moveCards(
      initial,
      [first!, second!, third!].map((instanceId, index) => ({
        instanceId,
        playerId: "player-1" as const,
        zone: "battlefield" as const,
        position: { x: 0.2 + index * 0.2, y: 0.4, z: index },
      })),
    )
    const firstAttached = attachCard(battlefield, first!, second!)
    const multiple = attachCard(firstAttached, third!, second!)
    const changed = attachCard(multiple, first!, third!)
    const cycle = attachCard(changed, third!, first!)
    expect(multiple.cardsById[first!]?.attachedTo).toBe(second)
    expect(multiple.cardsById[third!]?.attachedTo).toBe(second)
    expect(changed.cardsById[first!]?.attachedTo).toBe(third)
    expect(cycle).toBe(changed)
    expect(
      detachCard(changed, first!).cardsById[first!]?.attachedTo,
    ).toBeUndefined()
  })

  it("ruimt attachment- en groepsverwijzingen op wanneer een kaart vertrekt", () => {
    const initial = makeGame()
    const [first, second] = initial.players["player-1"].zones.hand
    const battlefield = moveCards(
      initial,
      [first!, second!].map((instanceId, index) => ({
        instanceId,
        playerId: "player-1" as const,
        zone: "battlefield" as const,
        position: { x: 0.3 + index * 0.2, y: 0.5, z: index },
      })),
    )
    const attached = attachCard(battlefield, first!, second!)
    const grouped = createCardGroup(attached, {
      groupId: "group",
      playerId: "player-1",
      cardIds: [first!, second!],
    })
    const moved = moveCard(grouped, second!, "player-1", "graveyard")
    expect(moved.cardsById[first!]?.attachedTo).toBeUndefined()
    expect(moved.groupsById.group?.cardIds).toEqual([first])
  })

  it("beheert duurzame groepen en verplaatst kaarten gezamenlijk", () => {
    const initial = makeGame()
    const [first, second, third] = initial.players["player-1"].zones.hand
    const battlefield = moveCards(
      initial,
      [first!, second!, third!].map((instanceId, index) => ({
        instanceId,
        playerId: "player-1" as const,
        zone: "battlefield" as const,
        position: { x: 0.2 + index * 0.1, y: 0.4, z: index + 1 },
      })),
    )
    const created = createCardGroup(battlefield, {
      groupId: "lands",
      playerId: "player-1",
      cardIds: [first!, second!],
      name: "Lands",
    })
    const expanded = addCardsToGroup(created, "lands", [third!])
    const named = updateCardGroup(expanded, "lands", {
      name: "Mana",
      collapsed: true,
    })
    const moved = moveCardGroup(named, "lands", {
      x: 0.7,
      y: 0.7,
      z: 10,
    })
    const reduced = removeCardsFromGroup(moved, "lands", [third!])
    const dissolved = dissolveCardGroup(reduced, "lands")
    expect(named.groupsById.lands).toMatchObject({
      name: "Mana",
      collapsed: true,
      cardIds: [first, second, third],
    })
    expect(moved.cardsById[first!]?.position?.x).toBeGreaterThan(0.5)
    expect(reduced.groupsById.lands?.cardIds).toEqual([first, second])
    expect(dissolved.groupsById.lands).toBeUndefined()
  })
})

describe("startspeler bepalen met een D20", () => {
  const rollState = (playerIds: string[]) =>
    createFirstPlayerRollState(playerIds)

  it("kiest bij twee spelers de unieke hoogste worp", () => {
    let state = rollState(["a", "b"])
    state = resolveFirstPlayerRoll(state, "a", 12)
    state = resolveFirstPlayerRoll(state, "b", 18)

    expect(state).toMatchObject({
      status: "winner_determined",
      winnerPlayerId: "b",
      startPlayerId: "b",
    })
  })

  it("laat na een hoogste tie alleen de tied spelers opnieuw gooien", () => {
    let state = rollState(["a", "b"])
    state = resolveFirstPlayerRoll(state, "a", 15)
    state = resolveFirstPlayerRoll(state, "b", 15)
    expect(state).toMatchObject({
      status: "tie",
      round: 2,
      eligiblePlayerIds: ["a", "b"],
      rolls: {},
    })

    state = resolveFirstPlayerRoll(state, "a", 7)
    state = resolveFirstPlayerRoll(state, "b", 14)
    expect(state.winnerPlayerId).toBe("b")
  })

  it("negeert een gelijke waarde onder de unieke hoogste worp", () => {
    let state = rollState(["a", "b", "c", "d"])
    state = resolveFirstPlayerRoll(state, "a", 18)
    state = resolveFirstPlayerRoll(state, "b", 12)
    state = resolveFirstPlayerRoll(state, "c", 12)
    state = resolveFirstPlayerRoll(state, "d", 5)

    expect(state.winnerPlayerId).toBe("a")
    expect(state.status).toBe("winner_determined")
  })

  it("elimineert bij vier spelers alleen deelnemers onder de hoogste tie", () => {
    let state = rollState(["a", "b", "c", "d"])
    state = resolveFirstPlayerRoll(state, "a", 19)
    state = resolveFirstPlayerRoll(state, "b", 19)
    state = resolveFirstPlayerRoll(state, "c", 14)
    state = resolveFirstPlayerRoll(state, "d", 2)

    expect(state.eligiblePlayerIds).toEqual(["a", "b"])
    expect(state.eliminatedPlayerIds).toEqual(["c", "d"])
    expect(state.rolls).toEqual({ c: 14, d: 2 })
  })

  it("verwerkt meerdere opeenvolgende ties met zes spelers", () => {
    let state = rollState(["a", "b", "c", "d", "e", "f"])
    for (const [playerId, value] of [
      ["a", 20],
      ["b", 20],
      ["c", 20],
      ["d", 12],
      ["e", 8],
      ["f", 3],
    ] as const) {
      state = resolveFirstPlayerRoll(state, playerId, value)
    }
    expect(state.eligiblePlayerIds).toEqual(["a", "b", "c"])

    state = resolveFirstPlayerRoll(state, "a", 17)
    state = resolveFirstPlayerRoll(state, "b", 17)
    state = resolveFirstPlayerRoll(state, "c", 4)
    expect(state.eligiblePlayerIds).toEqual(["a", "b"])

    state = resolveFirstPlayerRoll(state, "a", 9)
    state = resolveFirstPlayerRoll(state, "b", 13)
    expect(state.winnerPlayerId).toBe("b")
    expect(state.round).toBe(3)
  })

  it("slaat de winnaar op als actieve startspeler in ronde één", () => {
    let game = makeGame()
    game = applyFirstPlayerRoll(game, "player-1", 4)
    game = applyFirstPlayerRoll(game, "player-2", 16)

    expect(game.activePlayerId).toBe("player-2")
    expect(game.turnNumber).toBe(1)
    expect(game.firstPlayerRoll.startPlayerId).toBe("player-2")
  })
})
