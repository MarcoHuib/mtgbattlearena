import type {
  BattlefieldPosition,
  CardInstance,
  DeckSnapshot,
  GameState,
  PlayerId,
  PlayerState,
  PlayerZones,
  Zone,
} from "./types"

export type RandomSource = () => number
export type IdFactory = (prefix: string) => string

export const seededRandom = (seed: number): RandomSource => {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let result = value
    result = Math.imul(result ^ (result >>> 15), result | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296
  }
}

const emptyZones = (): PlayerZones => ({
  library: [],
  hand: [],
  battlefield: [],
  graveyard: [],
  exile: [],
  command: [],
})

export const shuffle = <T>(items: readonly T[], random: RandomSource): T[] => {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    const currentValue = result[index]
    const targetValue = result[target]
    if (currentValue !== undefined && targetValue !== undefined) {
      result[index] = targetValue
      result[target] = currentValue
    }
  }
  return result
}

const makePlayer = (playerId: PlayerId, deck: DeckSnapshot): PlayerState => ({
  id: playerId,
  name: deck.name,
  deckSnapshotId: deck.id,
  life: 40,
  zones: emptyZones(),
})

const definitionKey = (playerId: PlayerId, definitionId: string) =>
  `${playerId}:${definitionId}`

export const createGame = (
  decks: [DeckSnapshot, DeckSnapshot],
  options: {
    random: RandomSource
    createId: IdFactory
    now: string
  },
): GameState => {
  const players: GameState["players"] = {
    "player-1": makePlayer("player-1", decks[0]),
    "player-2": makePlayer("player-2", decks[1]),
  }
  const cardsById: GameState["cardsById"] = {}
  const cardDefinitionsById: GameState["cardDefinitionsById"] = {}

  ;(["player-1", "player-2"] as const).forEach((playerId, deckIndex) => {
    const deck = decks[deckIndex]
    for (const definition of deck.definitions) {
      cardDefinitionsById[definitionKey(playerId, definition.id)] = {
        ...definition,
        id: definitionKey(playerId, definition.id),
      }
    }

    for (const entry of deck.cards) {
      for (let copy = 0; copy < entry.quantity; copy += 1) {
        const instanceId = options.createId("card")
        const zone: Zone = entry.isCommander ? "command" : "library"
        const instance: CardInstance = {
          instanceId,
          definitionId: definitionKey(playerId, entry.definitionId),
          ownerId: playerId,
          controllerId: playerId,
          zone,
          tapped: false,
          faceDown: false,
          activeFaceIndex: 0,
          counters: {},
        }
        cardsById[instanceId] = instance
        players[playerId].zones[zone].push(instanceId)
      }
    }

    players[playerId].zones.library = shuffle(
      players[playerId].zones.library,
      options.random,
    )
  })

  const game: GameState = {
    schemaVersion: 3,
    id: options.createId("game"),
    title: `${decks[0].name} vs. ${decks[1].name}`,
    createdAt: options.now,
    updatedAt: options.now,
    activePlayerId: "player-1",
    turnNumber: 1,
    openingHands: {
      "player-1": { mulliganCount: 0, kept: false },
      "player-2": { mulliganCount: 0, kept: false },
    },
    deckSnapshotIds: [decks[0].id, decks[1].id],
    players,
    cardDefinitionsById,
    cardsById,
  }

  return drawOpeningHands(game, 7, options.now)
}

export const drawCards = (
  game: GameState,
  playerId: PlayerId,
  amount: number,
  now = new Date().toISOString(),
): GameState => {
  const next: GameState = {
    ...game,
    updatedAt: now,
    players: clonePlayersWithZones(game.players),
    cardsById: { ...game.cardsById },
  }
  for (let count = 0; count < amount; count += 1) {
    const instanceId = next.players[playerId].zones.library.pop()
    if (!instanceId) break
    next.players[playerId].zones.hand.push(instanceId)
    const card = next.cardsById[instanceId]
    if (card) next.cardsById[instanceId] = { ...card, zone: "hand" }
  }
  return next
}

export const drawOpeningHands = (
  game: GameState,
  amount: number,
  now = new Date().toISOString(),
): GameState => {
  const first = drawCards(game, "player-1", amount, now)
  return drawCards(first, "player-2", amount, now)
}

const removeCardFromZones = (game: GameState, instanceId: string) => {
  for (const player of Object.values(game.players)) {
    for (const zone of Object.keys(player.zones) as Zone[]) {
      player.zones[zone] = player.zones[zone].filter(id => id !== instanceId)
    }
  }
}

const cloneZones = (zones: PlayerZones): PlayerZones => ({
  library: [...zones.library],
  hand: [...zones.hand],
  battlefield: [...zones.battlefield],
  graveyard: [...zones.graveyard],
  exile: [...zones.exile],
  command: [...zones.command],
})

const clonePlayersWithZones = (
  players: GameState["players"],
): GameState["players"] => ({
  "player-1": {
    ...players["player-1"],
    zones: cloneZones(players["player-1"].zones),
  },
  "player-2": {
    ...players["player-2"],
    zones: cloneZones(players["player-2"].zones),
  },
})

export const openingHandSizeAfterMulligan = (mulliganCount: number): number =>
  Math.max(0, Math.min(7, 9 - mulliganCount))

export const mulliganOpeningHand = (
  game: GameState,
  playerId: PlayerId,
  random: RandomSource,
  now = new Date().toISOString(),
): GameState => {
  const openingHand = game.openingHands[playerId]
  if (openingHand.kept) return game
  const next: GameState = {
    ...game,
    updatedAt: now,
    players: clonePlayersWithZones(game.players),
    cardsById: { ...game.cardsById },
    openingHands: {
      ...game.openingHands,
      [playerId]: {
        mulliganCount: openingHand.mulliganCount + 1,
        kept: false,
      },
    },
  }
  const returnedCards = [...next.players[playerId].zones.hand]
  next.players[playerId].zones.hand = []
  for (const instanceId of returnedCards) {
    const card = next.cardsById[instanceId]
    if (card) {
      next.cardsById[instanceId] = {
        ...card,
        zone: "library",
        tapped: false,
        position: undefined,
      }
    }
  }
  next.players[playerId].zones.library = shuffle(
    [...next.players[playerId].zones.library, ...returnedCards],
    random,
  )
  return drawCards(
    next,
    playerId,
    openingHandSizeAfterMulligan(openingHand.mulliganCount + 1),
    now,
  )
}

export const keepOpeningHand = (
  game: GameState,
  playerId: PlayerId,
  now = new Date().toISOString(),
): GameState => {
  const openingHand = game.openingHands[playerId]
  if (openingHand.kept) return game
  return {
    ...game,
    updatedAt: now,
    openingHands: {
      ...game.openingHands,
      [playerId]: { ...openingHand, kept: true },
    },
  }
}

export const moveCard = (
  game: GameState,
  instanceId: string,
  playerId: PlayerId,
  zone: Zone,
  position?: BattlefieldPosition,
  now = new Date().toISOString(),
): GameState => {
  const card = game.cardsById[instanceId]
  if (!card) return game

  const next: GameState = {
    ...game,
    updatedAt: now,
    players: clonePlayersWithZones(game.players),
    cardsById: { ...game.cardsById },
  }
  removeCardFromZones(next, instanceId)
  next.players[playerId].zones[zone].push(instanceId)
  next.cardsById[instanceId] = {
    ...card,
    zone,
    controllerId: playerId,
    tapped: zone === "battlefield" ? card.tapped : false,
    position: zone === "battlefield" ? position : undefined,
  }
  return next
}

export const toggleCardTapped = (
  game: GameState,
  instanceId: string,
  now = new Date().toISOString(),
): GameState => {
  const card = game.cardsById[instanceId]
  if (card?.zone !== "battlefield") return game
  return {
    ...game,
    updatedAt: now,
    cardsById: {
      ...game.cardsById,
      [instanceId]: { ...card, tapped: !card.tapped },
    },
  }
}

export const setCardCounter = (
  game: GameState,
  instanceId: string,
  counter: string,
  value: number,
  now = new Date().toISOString(),
): GameState => {
  const card = game.cardsById[instanceId]
  const normalizedCounter = counter.trim()
  if (!card || !normalizedCounter) return game
  const normalizedValue = Math.max(0, Math.floor(value))
  const counters =
    normalizedValue === 0
      ? Object.fromEntries(
          Object.entries(card.counters).filter(
            ([counterName]) => counterName !== normalizedCounter,
          ),
        )
      : { ...card.counters, [normalizedCounter]: normalizedValue }
  return {
    ...game,
    updatedAt: now,
    cardsById: {
      ...game.cardsById,
      [instanceId]: { ...card, counters },
    },
  }
}

export const advanceTurn = (
  game: GameState,
  now = new Date().toISOString(),
): GameState => {
  const activePlayerId: PlayerId =
    game.activePlayerId === "player-1" ? "player-2" : "player-1"
  const cardsById = { ...game.cardsById }
  for (const instanceId of game.players[activePlayerId].zones.battlefield) {
    const card = cardsById[instanceId]
    if (card?.tapped) {
      cardsById[instanceId] = { ...card, tapped: false }
    }
  }
  return drawCards(
    {
      ...game,
      updatedAt: now,
      activePlayerId,
      turnNumber: game.turnNumber + 1,
      cardsById,
    },
    activePlayerId,
    1,
    now,
  )
}

export const changePlayerLife = (
  game: GameState,
  playerId: PlayerId,
  delta: number,
  now = new Date().toISOString(),
): GameState => ({
  ...game,
  updatedAt: now,
  players: {
    ...game.players,
    [playerId]: {
      ...game.players[playerId],
      life: game.players[playerId].life + delta,
    },
  },
})
