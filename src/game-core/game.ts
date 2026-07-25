import type {
  BattlefieldPosition,
  CardInstance,
  DeckSnapshot,
  GameState,
  PlayerId,
  PlayerState,
  PlayerZones,
  TokenKind,
  TurnPhase,
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
  poison: 0,
  commanderTax: {},
  commanderDamage: {},
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
          isCommander: entry.isCommander,
        }
        cardsById[instanceId] = instance
        players[playerId].zones[zone].push(instanceId)
        if (entry.isCommander) {
          players[playerId].commanderTax[instanceId] = 0
        }
      }
    }

    players[playerId].zones.library = shuffle(
      players[playerId].zones.library,
      options.random,
    )
  })

  const game: GameState = {
    schemaVersion: 4,
    id: options.createId("game"),
    title: `${decks[0].name} vs. ${decks[1].name}`,
    createdAt: options.now,
    updatedAt: options.now,
    activePlayerId: "player-1",
    turnNumber: 1,
    phase: "beginning",
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
  const normalizedAmount = Math.max(0, Math.floor(amount))
  if (normalizedAmount === 0) return game
  const next: GameState = {
    ...game,
    updatedAt: now,
    players: clonePlayersWithZones(game.players),
    cardsById: { ...game.cardsById },
  }
  for (let count = 0; count < normalizedAmount; count += 1) {
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
  if (zone === "command") {
    const owner = next.players[card.ownerId]
    owner.commanderTax = {
      ...owner.commanderTax,
      [instanceId]: owner.commanderTax[instanceId] ?? 0,
    }
  }
  next.cardsById[instanceId] = {
    ...card,
    zone,
    controllerId: playerId,
    tapped: zone === "battlefield" ? card.tapped : false,
    isCommander: zone === "command" ? true : card.isCommander,
    position: zone === "battlefield" ? position : undefined,
  }
  return next
}

export type CardMove = {
  instanceId: string
  playerId: PlayerId
  zone: Zone
  position?: BattlefieldPosition
}

export const moveCards = (
  game: GameState,
  moves: readonly CardMove[],
  now = new Date().toISOString(),
): GameState => {
  const uniqueMoves = [
    ...new Map(
      moves
        .filter(move => game.cardsById[move.instanceId] !== undefined)
        .map(move => [move.instanceId, move]),
    ).values(),
  ]
  if (uniqueMoves.length === 0) return game
  return uniqueMoves.reduce(
    (currentGame, move) =>
      moveCard(
        currentGame,
        move.instanceId,
        move.playerId,
        move.zone,
        move.position,
        now,
      ),
    game,
  )
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

export const toggleCardsTapped = (
  game: GameState,
  instanceIds: readonly string[],
  now = new Date().toISOString(),
): GameState => {
  const battlefieldCards = [...new Set(instanceIds)].filter(
    instanceId => game.cardsById[instanceId]?.zone === "battlefield",
  )
  if (battlefieldCards.length === 0) return game
  const cardsById = { ...game.cardsById }
  for (const instanceId of battlefieldCards) {
    const card = cardsById[instanceId]
    if (card) cardsById[instanceId] = { ...card, tapped: !card.tapped }
  }
  return { ...game, updatedAt: now, cardsById }
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

export const switchCardFace = (
  game: GameState,
  instanceId: string,
  now = new Date().toISOString(),
): GameState => {
  const card = game.cardsById[instanceId]
  const definition = card
    ? game.cardDefinitionsById[card.definitionId]
    : undefined
  if (!card || !definition || definition.faces.length < 2) return game
  return {
    ...game,
    updatedAt: now,
    cardsById: {
      ...game.cardsById,
      [instanceId]: {
        ...card,
        activeFaceIndex: (card.activeFaceIndex + 1) % definition.faces.length,
      },
    },
  }
}

export const setCardStackOrder = (
  game: GameState,
  instanceId: string,
  direction: "front" | "back",
  now = new Date().toISOString(),
): GameState => {
  const card = game.cardsById[instanceId]
  if (card?.zone !== "battlefield") return game
  const positions = game.players[card.controllerId].zones.battlefield.map(
    id => game.cardsById[id]?.position?.z ?? 0,
  )
  const cardsById = { ...game.cardsById }
  if (direction === "back") {
    for (const otherId of game.players[card.controllerId].zones.battlefield) {
      if (otherId === instanceId) continue
      const other = cardsById[otherId]
      if (!other) continue
      cardsById[otherId] = {
        ...other,
        position: {
          x: other.position?.x ?? 0.5,
          y: other.position?.y ?? 0.5,
          z: (other.position?.z ?? 0) + 1,
        },
      }
    }
  }
  return {
    ...game,
    updatedAt: now,
    cardsById: {
      ...cardsById,
      [instanceId]: {
        ...card,
        position: {
          x: card.position?.x ?? 0.5,
          y: card.position?.y ?? 0.5,
          z: direction === "front" ? Math.max(0, ...positions) + 1 : 0,
        },
      },
    },
  }
}

export const untapAllCards = (
  game: GameState,
  playerId: PlayerId,
  now = new Date().toISOString(),
): GameState => {
  const tappedCards = game.players[playerId].zones.battlefield.filter(
    instanceId => game.cardsById[instanceId]?.tapped,
  )
  if (tappedCards.length === 0) return game
  const cardsById = { ...game.cardsById }
  for (const instanceId of tappedCards) {
    const card = cardsById[instanceId]
    if (card) cardsById[instanceId] = { ...card, tapped: false }
  }
  return { ...game, updatedAt: now, cardsById }
}

export const millCards = (
  game: GameState,
  playerId: PlayerId,
  amount: number,
  now = new Date().toISOString(),
): GameState => {
  const normalizedAmount = Math.max(0, Math.floor(amount))
  if (normalizedAmount === 0) return game
  const moves: CardMove[] = []
  const library = game.players[playerId].zones.library
  for (
    let offset = 0;
    offset < Math.min(normalizedAmount, library.length);
    offset += 1
  ) {
    const instanceId = library[library.length - 1 - offset]
    if (instanceId) moves.push({ instanceId, playerId, zone: "graveyard" })
  }
  return moveCards(game, moves, now)
}

export const shuffleLibrary = (
  game: GameState,
  playerId: PlayerId,
  random: RandomSource,
  now = new Date().toISOString(),
): GameState => ({
  ...game,
  updatedAt: now,
  players: {
    ...game.players,
    [playerId]: {
      ...game.players[playerId],
      zones: {
        ...game.players[playerId].zones,
        library: shuffle(game.players[playerId].zones.library, random),
      },
    },
  },
})

const turnPhases: TurnPhase[] = [
  "beginning",
  "precombat-main",
  "combat",
  "postcombat-main",
  "ending",
]

export const advancePhase = (
  game: GameState,
  now = new Date().toISOString(),
): GameState => {
  const currentIndex = turnPhases.indexOf(game.phase)
  if (currentIndex === turnPhases.length - 1) return advanceTurn(game, now)
  return {
    ...game,
    updatedAt: now,
    phase: turnPhases[currentIndex + 1] ?? "beginning",
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
      phase: "beginning",
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

export const changePlayerPoison = (
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
      poison: Math.max(0, game.players[playerId].poison + delta),
    },
  },
})

export const changeCommanderTax = (
  game: GameState,
  playerId: PlayerId,
  commanderId: string,
  delta: number,
  now = new Date().toISOString(),
): GameState => {
  const commander = game.cardsById[commanderId]
  if (commander?.ownerId !== playerId) return game
  const player = game.players[playerId]
  const value = Math.max(0, (player.commanderTax[commanderId] ?? 0) + delta)
  return {
    ...game,
    updatedAt: now,
    players: {
      ...game.players,
      [playerId]: {
        ...player,
        commanderTax: { ...player.commanderTax, [commanderId]: value },
      },
    },
  }
}

export const changeCommanderDamage = (
  game: GameState,
  damagedPlayerId: PlayerId,
  commanderId: string,
  delta: number,
  now = new Date().toISOString(),
): GameState => {
  const commander = game.cardsById[commanderId]
  if (!commander || commander.ownerId === damagedPlayerId) return game
  const player = game.players[damagedPlayerId]
  const value = Math.max(0, (player.commanderDamage[commanderId] ?? 0) + delta)
  return {
    ...game,
    updatedAt: now,
    players: {
      ...game.players,
      [damagedPlayerId]: {
        ...player,
        commanderDamage: {
          ...player.commanderDamage,
          [commanderId]: value,
        },
      },
    },
  }
}

type CreateTokenOptions = {
  playerId: PlayerId
  kind: TokenKind
  name: string
  power?: number
  toughness?: number
  position?: BattlefieldPosition
  createId: IdFactory
  now?: string
}

export const createToken = (
  game: GameState,
  options: CreateTokenOptions,
): GameState => {
  const name = options.name.trim() || "Token"
  const definitionId = options.createId("token-definition")
  const instanceId = options.createId("token")
  const now = options.now ?? new Date().toISOString()
  const typeLine =
    options.kind === "creature" || options.kind === "copy"
      ? "Token Creature"
      : `Token Artifact — ${name}`
  return {
    ...game,
    updatedAt: now,
    cardDefinitionsById: {
      ...game.cardDefinitionsById,
      [definitionId]: {
        id: definitionId,
        name,
        typeLine,
        faces: [{ name, typeLine }],
        imageRefs: [],
        token: {
          kind: options.kind,
          name,
          power: options.power,
          toughness: options.toughness,
        },
      },
    },
    cardsById: {
      ...game.cardsById,
      [instanceId]: {
        instanceId,
        definitionId,
        ownerId: options.playerId,
        controllerId: options.playerId,
        zone: "battlefield",
        tapped: false,
        faceDown: false,
        activeFaceIndex: 0,
        counters: {},
        position: options.position,
      },
    },
    players: {
      ...game.players,
      [options.playerId]: {
        ...game.players[options.playerId],
        zones: {
          ...game.players[options.playerId].zones,
          battlefield: [
            ...game.players[options.playerId].zones.battlefield,
            instanceId,
          ],
        },
      },
    },
  }
}

export const duplicateToken = (
  game: GameState,
  instanceId: string,
  createId: IdFactory,
  now = new Date().toISOString(),
): GameState => {
  const token = game.cardsById[instanceId]
  const definition = token
    ? game.cardDefinitionsById[token.definitionId]
    : undefined
  if (!token || !definition?.token) return game
  const duplicateId = createId("token")
  const position = token.position
    ? {
        x: Math.min(1, token.position.x + 0.04),
        y: Math.min(1, token.position.y + 0.04),
        z: token.position.z + 1,
      }
    : undefined
  return {
    ...game,
    updatedAt: now,
    cardsById: {
      ...game.cardsById,
      [duplicateId]: {
        ...token,
        instanceId: duplicateId,
        tapped: false,
        counters: {},
        position,
      },
    },
    players: {
      ...game.players,
      [token.controllerId]: {
        ...game.players[token.controllerId],
        zones: {
          ...game.players[token.controllerId].zones,
          battlefield: [
            ...game.players[token.controllerId].zones.battlefield,
            duplicateId,
          ],
        },
      },
    },
  }
}
