import type {
  BattlefieldPosition,
  CardDefinition,
  CardGroup,
  CardInstance,
  DeckSnapshot,
  GameState,
  DayNightStatus,
  OptionalPlayerTracker,
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

const makePlayer = (
  playerId: PlayerId,
  name: string,
  deck: DeckSnapshot,
): PlayerState => ({
  id: playerId,
  name,
  deckSnapshotId: deck.id,
  life: 40,
  poison: 0,
  trackers: { energy: 0, experience: 0, rad: 0 },
  visibleTrackers: { energy: false, experience: false, rad: false },
  citysBlessing: false,
  disabled: false,
  commanderTax: {},
  commanderDamage: {},
  zones: emptyZones(),
})

const definitionKey = (playerId: PlayerId, definitionId: string) =>
  `${playerId}:${definitionId}`

export type GamePlayerSetup = {
  id: PlayerId
  name: string
  deck: DeckSnapshot
}

export const createGameForPlayers = (
  playerSetups: readonly GamePlayerSetup[],
  options: {
    random: RandomSource
    createId: IdFactory
    now: string
  },
): GameState => {
  if (playerSetups.length < 2 || playerSetups.length > 6) {
    throw new Error("Een battle vereist 2 tot en met 6 spelers.")
  }
  const playerIds = playerSetups.map(player => player.id)
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error("Iedere speler moet een unieke player-ID hebben.")
  }
  const players: GameState["players"] = Object.fromEntries(
    playerSetups.map(player => [
      player.id,
      makePlayer(
        player.id,
        player.name.trim() || player.deck.name,
        player.deck,
      ),
    ]),
  )
  const cardsById: GameState["cardsById"] = {}
  const cardDefinitionsById: GameState["cardDefinitionsById"] = {}

  playerSetups.forEach(({ id: playerId, deck }) => {
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

  const firstPlayerId = playerIds[0]
  const game: GameState = {
    schemaVersion: 7,
    id: options.createId("game"),
    title: playerSetups.map(player => player.deck.name).join(" vs. "),
    createdAt: options.now,
    updatedAt: options.now,
    activePlayerId: firstPlayerId,
    turnNumber: 1,
    phase: "beginning",
    matchStatus: {
      monarchPlayerId: null,
      initiativePlayerId: null,
      dayNight: "none",
    },
    firstPlayerRoll: createFirstPlayerRollState(playerIds),
    openingHands: Object.fromEntries(
      playerIds.map(playerId => [playerId, { mulliganCount: 0, kept: false }]),
    ),
    deckSnapshotIds: playerSetups.map(player => player.deck.id),
    players,
    cardDefinitionsById,
    cardsById,
    groupsById: {},
  }

  return drawOpeningHands(game, 7, options.now)
}

export const createGame = (
  decks: [DeckSnapshot, DeckSnapshot],
  options: {
    random: RandomSource
    createId: IdFactory
    now: string
  },
): GameState =>
  createGameForPlayers(
    [
      { id: "player-1", name: decks[0].name, deck: decks[0] },
      { id: "player-2", name: decks[1].name, deck: decks[1] },
    ],
    options,
  )

export const createFirstPlayerRollState = (
  participantIds: PlayerId[],
): GameState["firstPlayerRoll"] => ({
  status: "rolling",
  round: 1,
  participantIds: [...participantIds],
  eligiblePlayerIds: [...participantIds],
  rolls: {},
  eliminatedPlayerIds: [],
  tiedPlayerIds: [],
  winnerPlayerId: null,
  startPlayerId: null,
  rollSequence: 0,
})

export const highestRollPlayerIds = (
  playerIds: PlayerId[],
  rolls: Partial<Record<PlayerId, number>>,
): PlayerId[] => {
  const completed = playerIds.filter(playerId => rolls[playerId] !== undefined)
  if (completed.length === 0) return []
  const highest = Math.max(...completed.map(playerId => rolls[playerId] ?? 0))
  return completed.filter(playerId => rolls[playerId] === highest)
}

export const canPlayerRollForFirst = (
  state: GameState["firstPlayerRoll"],
  playerId: PlayerId,
): boolean =>
  (state.status === "rolling" || state.status === "tie") &&
  state.eligiblePlayerIds.includes(playerId) &&
  state.rolls[playerId] === undefined

export const resolveFirstPlayerRoll = (
  state: GameState["firstPlayerRoll"],
  playerId: PlayerId,
  value: number,
): GameState["firstPlayerRoll"] => {
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > 20 ||
    !canPlayerRollForFirst(state, playerId)
  ) {
    return state
  }
  const rolls = { ...state.rolls, [playerId]: value }
  const waiting = state.eligiblePlayerIds.some(
    eligiblePlayerId => rolls[eligiblePlayerId] === undefined,
  )
  if (waiting) {
    return {
      ...state,
      rolls,
      rollSequence: state.rollSequence + 1,
    }
  }

  const highestPlayerIds = highestRollPlayerIds(state.eligiblePlayerIds, rolls)
  if (highestPlayerIds.length === 1) {
    const winnerPlayerId = highestPlayerIds[0] ?? null
    if (!winnerPlayerId) return state
    return {
      ...state,
      status: "winner_determined",
      rolls,
      eligiblePlayerIds: [],
      tiedPlayerIds: [],
      eliminatedPlayerIds: state.participantIds.filter(
        participantId => participantId !== winnerPlayerId,
      ),
      winnerPlayerId,
      startPlayerId: winnerPlayerId,
      rollSequence: state.rollSequence + 1,
    }
  }

  const previousEligible = new Set(state.eligiblePlayerIds)
  const nextRolls = Object.fromEntries(
    Object.entries(rolls).filter(
      ([rolledPlayerId]) => !highestPlayerIds.includes(rolledPlayerId),
    ),
  )
  const newlyEliminated = state.participantIds.filter(
    participantId =>
      previousEligible.has(participantId) &&
      !highestPlayerIds.includes(participantId),
  )
  return {
    ...state,
    status: "tie",
    round: state.round + 1,
    eligiblePlayerIds: highestPlayerIds,
    rolls: nextRolls,
    eliminatedPlayerIds: [
      ...new Set([...state.eliminatedPlayerIds, ...newlyEliminated]),
    ],
    tiedPlayerIds: highestPlayerIds,
    rollSequence: state.rollSequence + 1,
  }
}

export const applyFirstPlayerRoll = (
  game: GameState,
  playerId: PlayerId,
  value: number,
  now = new Date().toISOString(),
): GameState => {
  const firstPlayerRoll = resolveFirstPlayerRoll(
    game.firstPlayerRoll,
    playerId,
    value,
  )
  if (firstPlayerRoll === game.firstPlayerRoll) return game
  return {
    ...game,
    updatedAt: now,
    activePlayerId: firstPlayerRoll.winnerPlayerId ?? game.activePlayerId,
    turnNumber: 1,
    phase: "beginning",
    firstPlayerRoll,
  }
}

export const completeFirstPlayerRoll = (
  game: GameState,
  now = new Date().toISOString(),
): GameState => {
  const winnerPlayerId = game.firstPlayerRoll.winnerPlayerId
  if (game.firstPlayerRoll.status !== "winner_determined" || !winnerPlayerId) {
    return game
  }
  return {
    ...game,
    updatedAt: now,
    activePlayerId: winnerPlayerId,
    turnNumber: 1,
    phase: "beginning",
    firstPlayerRoll: {
      ...game.firstPlayerRoll,
      status: "completed",
      startPlayerId: winnerPlayerId,
    },
  }
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
  return Object.keys(game.players).reduce(
    (current, playerId) => drawCards(current, playerId, amount, now),
    game,
  )
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
): GameState["players"] =>
  Object.fromEntries(
    Object.entries(players).map(([playerId, player]) => [
      playerId,
      { ...player, zones: cloneZones(player.zones) },
    ]),
  )

export const openingHandBottomCount = (mulliganCount: number): number =>
  Math.max(0, Math.min(6, mulliganCount - 1))

export const openingHandKeepCount = (mulliganCount: number): number =>
  7 - openingHandBottomCount(mulliganCount)

export const openingHandSizeAfterMulligan = (mulliganCount: number): number => {
  void mulliganCount
  return 7
}

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
  return drawCards(next, playerId, 7, now)
}

export const keepOpeningHand = (
  game: GameState,
  playerId: PlayerId,
  bottomCardIds: string[] = [],
  now = new Date().toISOString(),
): GameState => {
  const openingHand = game.openingHands[playerId]
  if (openingHand.kept) return game
  const requiredBottomCount = openingHandBottomCount(openingHand.mulliganCount)
  const uniqueBottomCardIds = [...new Set(bottomCardIds)]
  const hand = game.players[playerId].zones.hand
  if (
    uniqueBottomCardIds.length !== requiredBottomCount ||
    uniqueBottomCardIds.some(instanceId => !hand.includes(instanceId))
  ) {
    return game
  }
  const next: GameState = {
    ...game,
    updatedAt: now,
    players: clonePlayersWithZones(game.players),
    cardsById: { ...game.cardsById },
    openingHands: {
      ...game.openingHands,
      [playerId]: { ...openingHand, kept: true },
    },
  }
  next.players[playerId].zones.hand = hand.filter(
    instanceId => !uniqueBottomCardIds.includes(instanceId),
  )
  next.players[playerId].zones.library = [
    ...uniqueBottomCardIds,
    ...next.players[playerId].zones.library,
  ]
  for (const instanceId of uniqueBottomCardIds) {
    const card = next.cardsById[instanceId]
    if (card) next.cardsById[instanceId] = { ...card, zone: "library" }
  }
  return {
    ...next,
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
    groupsById: { ...game.groupsById },
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
    attachedTo:
      zone === "battlefield" && card.zone === "battlefield"
        ? card.attachedTo
        : undefined,
  }
  if (zone !== "battlefield") {
    for (const [otherId, otherCard] of Object.entries(next.cardsById)) {
      if (otherCard.attachedTo === instanceId) {
        next.cardsById[otherId] = { ...otherCard, attachedTo: undefined }
      }
    }
    for (const [groupId, group] of Object.entries(next.groupsById)) {
      if (!group.cardIds.includes(instanceId)) continue
      const cardIds = group.cardIds.filter(id => id !== instanceId)
      if (cardIds.length === 0) {
        next.groupsById = Object.fromEntries(
          Object.entries(next.groupsById).filter(([id]) => id !== groupId),
        )
      } else next.groupsById[groupId] = { ...group, cardIds }
    }
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
  if (card?.zone !== "battlefield" || definition?.faces.length !== 2) {
    return game
  }
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
  const activePlayers = Object.keys(game.players).filter(
    playerId => !game.players[playerId]?.disabled,
  )
  const activeIndex = activePlayers.indexOf(game.activePlayerId)
  const activePlayerId =
    activePlayers[(activeIndex + 1) % activePlayers.length] ??
    game.activePlayerId
  const startPlayerId =
    game.firstPlayerRoll.startPlayerId ?? activePlayers[0] ?? activePlayerId
  const nextRound =
    activePlayerId === startPlayerId ? game.turnNumber + 1 : game.turnNumber
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
      turnNumber: nextRound,
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

export const changePlayerTracker = (
  game: GameState,
  playerId: PlayerId,
  tracker: OptionalPlayerTracker,
  delta: number,
  now = new Date().toISOString(),
): GameState => {
  const player = game.players[playerId]
  const value = Math.max(0, player.trackers[tracker] + delta)
  return {
    ...game,
    updatedAt: now,
    players: {
      ...game.players,
      [playerId]: {
        ...player,
        trackers: { ...player.trackers, [tracker]: value },
      },
    },
  }
}

export const setPlayerTrackerVisibility = (
  game: GameState,
  playerId: PlayerId,
  tracker: OptionalPlayerTracker,
  visible: boolean,
  now = new Date().toISOString(),
): GameState => {
  const player = game.players[playerId]
  if (player.visibleTrackers[tracker] === visible) return game
  return {
    ...game,
    updatedAt: now,
    players: {
      ...game.players,
      [playerId]: {
        ...player,
        visibleTrackers: { ...player.visibleTrackers, [tracker]: visible },
      },
    },
  }
}

export const setPlayerCitysBlessing = (
  game: GameState,
  playerId: PlayerId,
  active: boolean,
  now = new Date().toISOString(),
): GameState => {
  const player = game.players[playerId]
  if (player.citysBlessing === active) return game
  return {
    ...game,
    updatedAt: now,
    players: {
      ...game.players,
      [playerId]: { ...player, citysBlessing: active },
    },
  }
}

export const setPlayerDisabled = (
  game: GameState,
  playerId: PlayerId,
  disabled: boolean,
  now = new Date().toISOString(),
): GameState => {
  const player = game.players[playerId]
  if (player.disabled === disabled) return game
  return {
    ...game,
    updatedAt: now,
    players: {
      ...game.players,
      [playerId]: { ...player, disabled },
    },
  }
}

export const setMonarchHolder = (
  game: GameState,
  playerId: PlayerId | null,
  now = new Date().toISOString(),
): GameState => {
  if (game.matchStatus.monarchPlayerId === playerId) return game
  return {
    ...game,
    updatedAt: now,
    matchStatus: { ...game.matchStatus, monarchPlayerId: playerId },
  }
}

export const setInitiativeHolder = (
  game: GameState,
  playerId: PlayerId | null,
  now = new Date().toISOString(),
): GameState => {
  if (game.matchStatus.initiativePlayerId === playerId) return game
  return {
    ...game,
    updatedAt: now,
    matchStatus: { ...game.matchStatus, initiativePlayerId: playerId },
  }
}

export const setDayNightStatus = (
  game: GameState,
  dayNight: DayNightStatus,
  now = new Date().toISOString(),
): GameState => {
  if (game.matchStatus.dayNight === dayNight) return game
  return {
    ...game,
    updatedAt: now,
    matchStatus: { ...game.matchStatus, dayNight },
  }
}

export type PlayerWarning = "life" | "poison" | "commander-damage"

export const isCreatureDefinition = (
  definition: CardDefinition | undefined,
): boolean =>
  [
    definition?.typeLine,
    ...(definition?.faces.map(face => face.typeLine) ?? []),
  ].some(typeLine => /\bcreature\b/i.test(typeLine ?? ""))

export const getPlayerWarnings = (
  game: GameState,
  playerId: PlayerId,
): PlayerWarning[] => {
  const player = game.players[playerId]
  const warnings: PlayerWarning[] = []
  if (player.life <= 0) warnings.push("life")
  if (player.poison >= 10) warnings.push("poison")
  if (
    Object.entries(player.commanderDamage).some(([commanderId, value]) => {
      const commander = game.cardsById[commanderId]
      return (
        value >= 21 &&
        isCreatureDefinition(
          commander
            ? game.cardDefinitionsById[commander.definitionId]
            : undefined,
        )
      )
    })
  ) {
    warnings.push("commander-damage")
  }
  return warnings
}

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
  typeLine?: string
  imageRef?: CardDefinition["imageRefs"][number]
  power?: number | null
  toughness?: number | null
  position?: BattlefieldPosition
  createId: IdFactory
  now?: string
}

export const createToken = (
  game: GameState,
  options: CreateTokenOptions,
): GameState => {
  if (
    options.kind === "creature" &&
    (typeof options.power !== "number" || typeof options.toughness !== "number")
  )
    throw new Error("Een creature-token vereist numerieke power en toughness.")
  const name = options.name.trim() || "Token"
  const definitionId = options.createId("token-definition")
  const instanceId = options.createId("token")
  const now = options.now ?? new Date().toISOString()
  const typeLine =
    options.typeLine ??
    (options.kind === "creature" || options.kind === "copy"
      ? "Token Creature"
      : `Token Artifact — ${name}`)
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
        imageRefs: options.imageRef ? [options.imageRef] : [],
        token: {
          kind: options.kind,
          name,
          power: options.power,
          toughness: options.toughness,
          source: "custom",
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

type CreateKnownTokenOptions = {
  playerId: PlayerId
  definitionId: string
  instanceId: string
  position?: BattlefieldPosition
  now?: string
}

export const createKnownToken = (
  game: GameState,
  options: CreateKnownTokenOptions,
): GameState => {
  const definition = game.cardDefinitionsById[options.definitionId]
  if (
    !definition?.token ||
    game.cardsById[options.instanceId] ||
    !options.definitionId.startsWith(`${options.playerId}:`)
  ) {
    return game
  }
  const player = game.players[options.playerId]
  const instance: CardInstance = {
    instanceId: options.instanceId,
    definitionId: options.definitionId,
    ownerId: options.playerId,
    controllerId: options.playerId,
    zone: "battlefield",
    tapped: false,
    faceDown: false,
    activeFaceIndex: 0,
    counters: {},
    position: options.position,
  }
  return {
    ...game,
    updatedAt: options.now ?? new Date().toISOString(),
    cardsById: {
      ...game.cardsById,
      [instance.instanceId]: instance,
    },
    players: {
      ...game.players,
      [options.playerId]: {
        ...player,
        zones: {
          ...player.zones,
          battlefield: [...player.zones.battlefield, instance.instanceId],
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

export const topLibraryCards = (
  game: GameState,
  playerId: PlayerId,
  amount: number,
): string[] =>
  game.players[playerId].zones.library
    .slice(-Math.max(0, Math.floor(amount)))
    .reverse()

export const moveCardToLibraryPosition = (
  game: GameState,
  instanceId: string,
  playerId: PlayerId,
  position: "top" | "bottom",
  now = new Date().toISOString(),
): GameState => {
  const moved = moveCard(game, instanceId, playerId, "library", undefined, now)
  if (moved === game) return game
  const library = moved.players[playerId].zones.library.filter(
    id => id !== instanceId,
  )
  if (position === "top") library.push(instanceId)
  else library.unshift(instanceId)
  return {
    ...moved,
    players: {
      ...moved.players,
      [playerId]: {
        ...moved.players[playerId],
        zones: { ...moved.players[playerId].zones, library },
      },
    },
  }
}

const attachmentChainContains = (
  game: GameState,
  startId: string,
  soughtId: string,
): boolean => {
  const visited = new Set<string>()
  let currentId: string | undefined = startId
  while (currentId && !visited.has(currentId)) {
    if (currentId === soughtId) return true
    visited.add(currentId)
    currentId = game.cardsById[currentId]?.attachedTo
  }
  return false
}

export const attachCard = (
  game: GameState,
  attachmentId: string,
  targetId: string,
  now = new Date().toISOString(),
): GameState => {
  const attachment = game.cardsById[attachmentId]
  const target = game.cardsById[targetId]
  if (
    !attachment ||
    !target ||
    attachmentId === targetId ||
    attachment.zone !== "battlefield" ||
    target.zone !== "battlefield" ||
    attachment.controllerId !== target.controllerId ||
    attachmentChainContains(game, targetId, attachmentId)
  ) {
    return game
  }
  return {
    ...game,
    updatedAt: now,
    cardsById: {
      ...game.cardsById,
      [attachmentId]: { ...attachment, attachedTo: targetId },
    },
  }
}

export const detachCard = (
  game: GameState,
  attachmentId: string,
  now = new Date().toISOString(),
): GameState => {
  const attachment = game.cardsById[attachmentId]
  if (!attachment?.attachedTo) return game
  return {
    ...game,
    updatedAt: now,
    cardsById: {
      ...game.cardsById,
      [attachmentId]: { ...attachment, attachedTo: undefined },
    },
  }
}

const groupPositionFor = (
  game: GameState,
  cardIds: readonly string[],
): BattlefieldPosition => {
  const positions = cardIds.flatMap(id => {
    const position = game.cardsById[id]?.position
    return position ? [position] : []
  })
  if (positions.length === 0) return { x: 0.5, y: 0.5, z: 1 }
  return {
    x: positions.reduce((sum, item) => sum + item.x, 0) / positions.length,
    y: positions.reduce((sum, item) => sum + item.y, 0) / positions.length,
    z: Math.max(...positions.map(item => item.z)),
  }
}

const removeCardsFromExistingGroups = (
  groupsById: Record<string, CardGroup>,
  cardIds: readonly string[],
) => {
  const removed = new Set(cardIds)
  const next: Record<string, CardGroup> = {}
  for (const [groupId, group] of Object.entries(groupsById)) {
    const remaining = group.cardIds.filter(id => !removed.has(id))
    if (remaining.length === 0) continue
    next[groupId] =
      remaining.length === group.cardIds.length
        ? group
        : { ...group, cardIds: remaining }
  }
  return next
}

export const createCardGroup = (
  game: GameState,
  options: {
    groupId: string
    playerId: PlayerId
    cardIds: readonly string[]
    name?: string
  },
  now = new Date().toISOString(),
): GameState => {
  if (game.groupsById[options.groupId]) return game
  const cardIds = [...new Set(options.cardIds)].filter(id => {
    const card = game.cardsById[id]
    return (
      card?.zone === "battlefield" && card.controllerId === options.playerId
    )
  })
  if (cardIds.length < 2) return game
  const groupsById = removeCardsFromExistingGroups(game.groupsById, cardIds)
  const normalizedName = options.name?.trim()
  groupsById[options.groupId] = {
    id: options.groupId,
    playerId: options.playerId,
    name: normalizedName === "" ? undefined : normalizedName,
    cardIds,
    position: groupPositionFor(game, cardIds),
    collapsed: false,
  }
  return { ...game, updatedAt: now, groupsById }
}

export const updateCardGroup = (
  game: GameState,
  groupId: string,
  changes: { name?: string; collapsed?: boolean },
  now = new Date().toISOString(),
): GameState => {
  const group = game.groupsById[groupId]
  if (!group) return game
  return {
    ...game,
    updatedAt: now,
    groupsById: {
      ...game.groupsById,
      [groupId]: {
        ...group,
        name:
          changes.name === undefined
            ? group.name
            : changes.name.trim() || undefined,
        collapsed: changes.collapsed ?? group.collapsed,
      },
    },
  }
}

export const moveCardGroup = (
  game: GameState,
  groupId: string,
  position: BattlefieldPosition,
  now = new Date().toISOString(),
): GameState => {
  const group = game.groupsById[groupId]
  if (!group) return game
  const deltaX = position.x - group.position.x
  const deltaY = position.y - group.position.y
  const deltaZ = position.z - group.position.z
  const cardsById = { ...game.cardsById }
  for (const cardId of group.cardIds) {
    const card = cardsById[cardId]
    if (card?.zone !== "battlefield") continue
    const currentPosition = card.position ?? group.position
    cardsById[cardId] = {
      ...card,
      position: {
        x: Math.max(0, Math.min(1, currentPosition.x + deltaX)),
        y: Math.max(0, Math.min(1, currentPosition.y + deltaY)),
        z: Math.max(0, currentPosition.z + deltaZ),
      },
    }
  }
  return {
    ...game,
    updatedAt: now,
    cardsById,
    groupsById: {
      ...game.groupsById,
      [groupId]: { ...group, position },
    },
  }
}

export const addCardsToGroup = (
  game: GameState,
  groupId: string,
  cardIds: readonly string[],
  now = new Date().toISOString(),
): GameState => {
  const group = game.groupsById[groupId]
  if (!group) return game
  const additions = [...new Set(cardIds)].filter(id => {
    const card = game.cardsById[id]
    return card?.zone === "battlefield" && card.controllerId === group.playerId
  })
  if (additions.length === 0) return game
  const groupsById = removeCardsFromExistingGroups(game.groupsById, additions)
  groupsById[groupId] = {
    ...group,
    cardIds: [...new Set([...group.cardIds, ...additions])],
  }
  return { ...game, updatedAt: now, groupsById }
}

export const removeCardsFromGroup = (
  game: GameState,
  groupId: string,
  cardIds: readonly string[],
  now = new Date().toISOString(),
): GameState => {
  const group = game.groupsById[groupId]
  if (!group) return game
  const removed = new Set(cardIds)
  const remaining = group.cardIds.filter(id => !removed.has(id))
  const groupsById = { ...game.groupsById }
  const nextGroups =
    remaining.length === 0
      ? Object.fromEntries(
          Object.entries(groupsById).filter(([id]) => id !== groupId),
        )
      : { ...groupsById, [groupId]: { ...group, cardIds: remaining } }
  return { ...game, updatedAt: now, groupsById: nextGroups }
}

export const dissolveCardGroup = (
  game: GameState,
  groupId: string,
  now = new Date().toISOString(),
): GameState => {
  if (!game.groupsById[groupId]) return game
  const groupsById = Object.fromEntries(
    Object.entries(game.groupsById).filter(([id]) => id !== groupId),
  )
  return { ...game, updatedAt: now, groupsById }
}
