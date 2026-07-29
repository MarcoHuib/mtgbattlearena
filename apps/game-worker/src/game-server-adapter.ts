import { z } from "zod"
import {
  changePlayerLife,
  changePlayerPoison,
  drawCards,
  keepOpeningHand,
  millCards,
  moveCard,
  mulliganOpeningHand,
  seededRandom,
  setDayNightStatus,
  setInitiativeHolder,
  setMonarchHolder,
  shuffle,
  shuffleLibrary,
  toggleCardTapped,
  untapAllCards,
  type IdFactory,
  type RandomSource,
} from "@mtg/game-core/game"
import type {
  CardDefinition,
  CardInstance,
  GameMode,
  GameState,
  PlayerId,
  PlayerState,
  Zone,
} from "@mtg/game-core/types"
import {
  onlineDeckSubmissionSchema,
  personalGameSnapshotSchema,
  type GameCommand,
  type OnlineDeckSubmission,
  type PersonalGameSnapshot,
  type VisibleOnlineCard,
} from "@mtg/game-protocol"
import type { GameSession } from "./types"

const onlinePlayerSubmissionSchema = onlineDeckSubmissionSchema.safeExtend({
  playerId: z.string().min(1).max(80),
  displayName: z.string().min(1).max(80),
})

export const onlineGameSubmissionSchema = z
  .object({
    gameId: z.string().min(1).max(120),
    title: z.string().min(1).max(120),
    players: z.array(onlinePlayerSubmissionSchema).min(2).max(6),
  })
  .strict()
  .superRefine((seed, context) => {
    const playerIds = seed.players.map(player => player.playerId)
    if (new Set(playerIds).size !== playerIds.length) {
      context.addIssue({
        code: "custom",
        message: "Speler-ID’s moeten uniek zijn.",
        path: ["players"],
      })
    }
  })

export const onlineGameSeedSchema = onlineGameSubmissionSchema.safeExtend({
  players: z
    .array(
      onlinePlayerSubmissionSchema.safeExtend({
        uid: z.string().min(1).max(128),
      }),
    )
    .min(2)
    .max(6),
})

export type OnlineGameSubmission = z.infer<typeof onlineGameSubmissionSchema>
export type OnlineGameSeed = z.infer<typeof onlineGameSeedSchema>
export type { OnlineDeckSubmission }

export type AuthoritativeGameState = {
  schemaVersion: 3
  mode: Extract<GameMode, "online">
  gameId: string
  version: number
  title: string
  createdAt: string
  updatedAt: string
  turnOrder: PlayerId[]
  activePlayerId: PlayerId
  turnNumber: number
  phase: GameState["phase"]
  matchStatus: GameState["matchStatus"]
  openingHands: GameState["openingHands"]
  players: Record<PlayerId, PlayerState>
  playerUids: Record<PlayerId, string>
  cardDefinitionsById: Record<string, CardDefinition>
  cardsById: Record<string, CardInstance>
}

export type ServerAdapterOptions = {
  now: () => string
  random: RandomSource
  createId: IdFactory
}

const defaultOptions = (): ServerAdapterOptions => ({
  now: () => new Date().toISOString(),
  random: () => {
    const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
    return value / 4_294_967_296
  },
  createId: prefix => `${prefix}-${crypto.randomUUID()}`,
})

const emptyZones = (): PlayerState["zones"] => ({
  library: [],
  hand: [],
  battlefield: [],
  graveyard: [],
  exile: [],
  command: [],
})

const createPlayer = (
  playerId: string,
  displayName: string,
  deckSnapshotId: string,
): PlayerState => ({
  id: playerId,
  name: displayName,
  deckSnapshotId,
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

const definitionKey = (playerId: string, definitionId: string) =>
  `${playerId}:${definitionId}`

const toCoreGame = (state: AuthoritativeGameState): GameState => ({
  schemaVersion: 6,
  id: state.gameId,
  title: state.title,
  createdAt: state.createdAt,
  updatedAt: state.updatedAt,
  activePlayerId: state.activePlayerId,
  turnNumber: state.turnNumber,
  phase: state.phase,
  matchStatus: state.matchStatus,
  openingHands: structuredClone(state.openingHands),
  deckSnapshotIds: [
    state.players[state.turnOrder[0] ?? ""]?.deckSnapshotId ?? "online",
    state.players[state.turnOrder[1] ?? ""]?.deckSnapshotId ?? "online",
  ],
  players: state.players,
  cardDefinitionsById: state.cardDefinitionsById,
  cardsById: state.cardsById,
  groupsById: {},
})

const fromCoreGame = (
  state: AuthoritativeGameState,
  core: GameState,
): AuthoritativeGameState => ({
  ...state,
  updatedAt: core.updatedAt,
  activePlayerId: core.activePlayerId,
  turnNumber: core.turnNumber,
  phase: core.phase,
  matchStatus: core.matchStatus,
  openingHands: core.openingHands,
  players: core.players,
  cardDefinitionsById: core.cardDefinitionsById,
  cardsById: core.cardsById,
})

export const createAuthoritativeGame = (
  input: OnlineGameSeed,
  providedOptions?: Partial<ServerAdapterOptions>,
): AuthoritativeGameState => {
  const seed = onlineGameSeedSchema.parse(input)
  const options = { ...defaultOptions(), ...providedOptions }
  const createdAt = options.now()
  const turnOrder = seed.players.map(player => player.playerId)
  const players: Record<PlayerId, PlayerState> = {}
  const playerUids: Record<PlayerId, string> = {}
  const cardDefinitionsById: Record<string, CardDefinition> = {}
  const cardsById: Record<string, CardInstance> = {}

  for (const playerSeed of seed.players) {
    const player = createPlayer(
      playerSeed.playerId,
      playerSeed.displayName,
      playerSeed.deckSnapshotId,
    )
    players[player.id] = player
    playerUids[player.id] = playerSeed.uid

    for (const entry of playerSeed.cards) {
      const keyedDefinitionId = definitionKey(
        playerSeed.playerId,
        entry.definitionId,
      )
      cardDefinitionsById[keyedDefinitionId] = {
        id: keyedDefinitionId,
        name: entry.name,
        scryfallId: entry.scryfallId,
        typeLine: entry.typeLine,
        faces: [
          {
            name: entry.name,
            typeLine: entry.typeLine,
            imageUrl: entry.imageUrl,
          },
        ],
        imageRefs: entry.imageUrl
          ? [
              {
                assetKey: `${keyedDefinitionId}:0:normal`,
                faceIndex: 0,
                variant: "normal",
                url: entry.imageUrl,
              },
            ]
          : [],
      }
      for (let copy = 0; copy < entry.quantity; copy += 1) {
        const instanceId = options.createId("online-card")
        const zone: Zone = entry.isCommander ? "command" : "library"
        cardsById[instanceId] = {
          instanceId,
          definitionId: keyedDefinitionId,
          ownerId: player.id,
          controllerId: player.id,
          zone,
          tapped: false,
          faceDown: false,
          activeFaceIndex: 0,
          counters: {},
          isCommander: entry.isCommander,
        }
        player.zones[zone].push(instanceId)
        if (entry.isCommander) player.commanderTax[instanceId] = 0
      }
    }
    player.zones.library = shuffle(player.zones.library, options.random)
  }

  let game: AuthoritativeGameState = {
    schemaVersion: 3,
    mode: "online",
    gameId: seed.gameId,
    version: 0,
    title: seed.title,
    createdAt,
    updatedAt: createdAt,
    turnOrder,
    activePlayerId: turnOrder[0] ?? "",
    turnNumber: 1,
    phase: "beginning",
    matchStatus: {
      monarchPlayerId: null,
      initiativePlayerId: null,
      dayNight: "none",
    },
    openingHands: Object.fromEntries(
      turnOrder.map(playerId => [playerId, { mulliganCount: 0, kept: false }]),
    ),
    players,
    playerUids,
    cardDefinitionsById,
    cardsById,
  }
  for (const playerId of turnOrder) {
    game = fromCoreGame(
      game,
      drawCards(toCoreGame(game), playerId, 7, createdAt),
    )
  }
  return game
}

export const migrateAuthoritativeGame = (
  state: AuthoritativeGameState,
): AuthoritativeGameState => {
  const legacy = state as AuthoritativeGameState & {
    schemaVersion: 1 | 2 | 3
    openingHands?: GameState["openingHands"]
    phase?: GameState["phase"]
    matchStatus?: GameState["matchStatus"]
  }
  if (
    legacy.schemaVersion === 3 &&
    legacy.openingHands &&
    legacy.phase &&
    legacy.matchStatus
  ) {
    return state
  }
  return {
    ...state,
    schemaVersion: 3,
    phase: legacy.phase ?? "beginning",
    matchStatus: legacy.matchStatus ?? {
      monarchPlayerId: null,
      initiativePlayerId: null,
      dayNight: "none",
    },
    openingHands:
      legacy.openingHands ??
      Object.fromEntries(
        state.turnOrder.map(playerId => [
          playerId,
          { mulliganCount: 0, kept: true },
        ]),
      ),
  }
}

export type ApplyCommandResult =
  | { accepted: true; state: AuthoritativeGameState }
  | {
      accepted: false
      code: "INVALID_COMMAND" | "NOT_READY"
      message: string
    }

const hasPlayer = (
  state: AuthoritativeGameState,
  playerId: string,
): playerId is PlayerId => state.players[playerId] !== undefined

const applyPassTurn = (
  state: AuthoritativeGameState,
  playerId: PlayerId,
  now: string,
): ApplyCommandResult => {
  if (state.activePlayerId !== playerId) {
    return {
      accepted: false,
      code: "INVALID_COMMAND",
      message: "Alleen de actieve speler kan de beurt doorgeven.",
    }
  }
  const activeIndex = state.turnOrder.indexOf(playerId)
  const nextPlayerId =
    state.turnOrder[(activeIndex + 1) % state.turnOrder.length]
  if (!nextPlayerId) {
    return {
      accepted: false,
      code: "INVALID_COMMAND",
      message: "De beurtvolgorde is ongeldig.",
    }
  }
  const advanced: AuthoritativeGameState = {
    ...state,
    activePlayerId: nextPlayerId,
    turnNumber: state.turnNumber + 1,
    phase: "beginning",
    updatedAt: now,
  }
  const untapped = untapAllCards(toCoreGame(advanced), nextPlayerId, now)
  const drawn = drawCards(untapped, nextPlayerId, 1, now)
  return { accepted: true, state: fromCoreGame(advanced, drawn) }
}

export const applyAuthoritativeCommand = (
  state: AuthoritativeGameState,
  session: GameSession,
  command: GameCommand,
  providedOptions?: Partial<ServerAdapterOptions>,
): ApplyCommandResult => {
  if (
    session.gameId !== state.gameId ||
    session.role !== "player" ||
    !session.playerId ||
    !hasPlayer(state, session.playerId) ||
    state.playerUids[session.playerId] !== session.uid
  ) {
    return {
      accepted: false,
      code: "INVALID_COMMAND",
      message: "De geverifieerde speler hoort niet bij deze game.",
    }
  }
  const playerId = session.playerId
  const options = { ...defaultOptions(), ...providedOptions }
  const now = options.now()
  const core = toCoreGame(state)
  let nextCore: GameState

  if (command.type === "MULLIGAN_HAND") {
    if (state.openingHands[playerId]?.kept) {
      return {
        accepted: false,
        code: "INVALID_COMMAND",
        message: "Deze openingshand is al gehouden.",
      }
    }
    nextCore = mulliganOpeningHand(core, playerId, options.random, now)
    return { accepted: true, state: fromCoreGame(state, nextCore) }
  }

  if (command.type === "KEEP_HAND") {
    if (state.openingHands[playerId]?.kept) {
      return {
        accepted: false,
        code: "INVALID_COMMAND",
        message: "Deze openingshand is al gehouden.",
      }
    }
    nextCore = keepOpeningHand(core, playerId, now)
    return { accepted: true, state: fromCoreGame(state, nextCore) }
  }

  if (state.turnOrder.some(id => !state.openingHands[id]?.kept)) {
    return {
      accepted: false,
      code: "NOT_READY",
      message: "Wacht tot iedere speler een openingshand heeft gekozen.",
    }
  }

  switch (command.type) {
    case "DRAW_CARD":
      nextCore = drawCards(core, playerId, command.payload.amount, now)
      break
    case "MOVE_CARD": {
      const card = state.cardsById[command.payload.instanceId]
      if (!card) {
        return {
          accepted: false,
          code: "INVALID_COMMAND",
          message: "De kaart bestaat niet in een toegestane eigen zone.",
        }
      }
      const inRecordedZone = state.players[playerId]?.zones[card.zone].includes(
        card.instanceId,
      )
      if (
        card.controllerId !== playerId ||
        card.ownerId !== playerId ||
        !inRecordedZone
      ) {
        return {
          accepted: false,
          code: "INVALID_COMMAND",
          message: "De kaart bestaat niet in een toegestane eigen zone.",
        }
      }
      nextCore = moveCard(
        core,
        card.instanceId,
        playerId,
        command.payload.zone,
        command.payload.position,
        now,
      )
      break
    }
    case "CHANGE_LIFE":
      nextCore = changePlayerLife(core, playerId, command.payload.delta, now)
      break
    case "CHANGE_POISON":
      nextCore = changePlayerPoison(core, playerId, command.payload.delta, now)
      break
    case "MILL":
      nextCore = millCards(core, playerId, command.payload.amount, now)
      break
    case "SHUFFLE_LIBRARY":
      nextCore = shuffleLibrary(core, playerId, options.random, now)
      break
    case "PASS_TURN":
      return applyPassTurn(state, playerId, now)
    case "TOGGLE_TAP": {
      const card = state.cardsById[command.payload.instanceId]
      if (card?.controllerId !== playerId || card.zone !== "battlefield") {
        return {
          accepted: false,
          code: "INVALID_COMMAND",
          message:
            "Alleen een eigen kaart op het battlefield kan worden getapt.",
        }
      }
      nextCore = toggleCardTapped(core, card.instanceId, now)
      break
    }
    case "NEXT_PHASE": {
      if (state.activePlayerId !== playerId) {
        return {
          accepted: false,
          code: "INVALID_COMMAND",
          message: "Alleen de actieve speler kan de fase doorgeven.",
        }
      }
      const phases: GameState["phase"][] = [
        "beginning",
        "precombat-main",
        "combat",
        "postcombat-main",
        "ending",
      ]
      const phaseIndex = phases.indexOf(state.phase)
      if (phaseIndex === phases.length - 1) {
        return applyPassTurn(state, playerId, now)
      }
      nextCore = {
        ...core,
        phase: phases[phaseIndex + 1] ?? "beginning",
        updatedAt: now,
      }
      break
    }
    case "SET_MONARCH":
      if (
        command.payload.playerId !== null &&
        !hasPlayer(state, command.payload.playerId)
      ) {
        return {
          accepted: false,
          code: "INVALID_COMMAND",
          message: "De gekozen monarch neemt niet deel aan deze game.",
        }
      }
      nextCore = setMonarchHolder(core, command.payload.playerId, now)
      break
    case "SET_INITIATIVE":
      if (
        command.payload.playerId !== null &&
        !hasPlayer(state, command.payload.playerId)
      ) {
        return {
          accepted: false,
          code: "INVALID_COMMAND",
          message:
            "De gekozen initiative-houder neemt niet deel aan deze game.",
        }
      }
      nextCore = setInitiativeHolder(core, command.payload.playerId, now)
      break
    case "SET_DAY_NIGHT":
      nextCore = setDayNightStatus(core, command.payload.status, now)
      break
  }
  return { accepted: true, state: fromCoreGame(state, nextCore) }
}

const visibleCard = (
  state: AuthoritativeGameState,
  instanceId: string,
): VisibleOnlineCard => {
  const card = state.cardsById[instanceId]
  if (!card) throw new Error("Kaartinstantie ontbreekt in authoritative state.")
  const definition = state.cardDefinitionsById[card.definitionId]
  if (!definition)
    throw new Error("Kaartdefinitie ontbreekt in authoritative state.")
  const activeFace =
    definition.faces[card.activeFaceIndex] ?? definition.faces[0]
  const imageUrl =
    activeFace?.imageUrl ??
    definition.imageRefs.find(ref => ref.faceIndex === card.activeFaceIndex)
      ?.url
  return {
    instanceId: card.instanceId,
    definitionId: card.definitionId,
    name: activeFace?.name ?? definition.name,
    imageUrl,
    typeLine: activeFace?.typeLine ?? definition.typeLine,
    tapped: card.tapped,
    activeFaceIndex: card.activeFaceIndex,
    counters: card.counters,
    position: card.position,
    isCommander: card.isCommander ?? false,
  }
}

export const serializePersonalSnapshot = (
  state: AuthoritativeGameState,
  session: GameSession,
): PersonalGameSnapshot => {
  if (session.gameId !== state.gameId) {
    throw new Error("Sessie hoort niet bij deze authoritative game.")
  }
  if (
    session.role === "player" &&
    (!session.playerId ||
      !state.players[session.playerId] ||
      state.playerUids[session.playerId] !== session.uid)
  ) {
    throw new Error("Geverifieerde speler ontbreekt in de game.")
  }
  const players = Object.fromEntries(
    state.turnOrder.map(playerId => {
      const player = state.players[playerId]
      if (!player) throw new Error("Speler ontbreekt in de beurtvolgorde.")
      return [
        playerId,
        {
          id: player.id,
          displayName: player.name,
          life: player.life,
          poison: player.poison,
          handCount: player.zones.hand.length,
          libraryCount: player.zones.library.length,
          battlefield: player.zones.battlefield.map(instanceId =>
            visibleCard(state, instanceId),
          ),
          graveyard: player.zones.graveyard.map(instanceId =>
            visibleCard(state, instanceId),
          ),
          exile: player.zones.exile.map(instanceId =>
            visibleCard(state, instanceId),
          ),
          command: player.zones.command.map(instanceId =>
            visibleCard(state, instanceId),
          ),
        },
      ]
    }),
  )
  const privatePlayer =
    session.role === "player" && session.playerId
      ? state.players[session.playerId]
      : undefined
  const privateView =
    privatePlayer && session.playerId
      ? {
          playerId: session.playerId,
          hand: privatePlayer.zones.hand.map(instanceId =>
            visibleCard(state, instanceId),
          ),
          revealedLibraryCards: [],
        }
      : null

  return personalGameSnapshotSchema.parse({
    type: "PERSONAL_SNAPSHOT",
    mode: "online",
    gameId: state.gameId,
    version: state.version,
    role: session.role,
    activePlayerId: state.activePlayerId,
    turnNumber: state.turnNumber,
    phase: state.phase,
    matchStatus: state.matchStatus,
    turnOrder: state.turnOrder,
    openingHands: state.openingHands,
    players,
    privateView,
  })
}

export const seededServerOptions = (
  seed: number,
  now: string,
): ServerAdapterOptions => {
  let id = 0
  return {
    now: () => now,
    random: seededRandom(seed),
    createId: prefix => `${prefix}-${(id += 1)}`,
  }
}
