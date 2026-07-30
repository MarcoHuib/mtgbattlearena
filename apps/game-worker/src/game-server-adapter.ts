import { z } from "zod"
import {
  addCardsToGroup,
  attachCard,
  changeCommanderDamage,
  changeCommanderTax,
  changePlayerLife,
  changePlayerPoison,
  changePlayerTracker,
  createKnownToken,
  createCardGroup,
  createToken,
  detachCard,
  dissolveCardGroup,
  drawCards,
  duplicateToken,
  keepOpeningHand,
  millCards,
  moveCard,
  moveCards,
  moveCardGroup,
  moveCardToLibraryPosition,
  mulliganOpeningHand,
  removeCardsFromGroup,
  seededRandom,
  setDayNightStatus,
  setCardCounter,
  setCardStackOrder,
  setInitiativeHolder,
  setMonarchHolder,
  setPlayerCitysBlessing,
  setPlayerDisabled,
  setPlayerTrackerVisibility,
  shuffle,
  shuffleLibrary,
  switchCardFace,
  toggleCardTapped,
  toggleCardsTapped,
  untapAllCards,
  updateCardGroup,
  type IdFactory,
  type RandomSource,
} from "@mtg/game-core/game"
import type {
  CardDefinition,
  CardGroup,
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
  type OnlineTokenDefinition,
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
  schemaVersion: 4
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
  libraryRevealCounts: Record<PlayerId, number>
  players: Record<PlayerId, PlayerState>
  playerUids: Record<PlayerId, string>
  cardDefinitionsById: Record<string, CardDefinition>
  cardsById: Record<string, CardInstance>
  groupsById?: Record<string, CardGroup>
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
  groupsById: state.groupsById ?? {},
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
  groupsById: core.groupsById,
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
      const faces = entry.faces ?? [
        {
          name: entry.name,
          typeLine: entry.typeLine,
          imageUrl: entry.imageUrl,
        },
      ]
      cardDefinitionsById[keyedDefinitionId] = {
        id: keyedDefinitionId,
        name: entry.name,
        scryfallId: entry.scryfallId,
        typeLine: entry.typeLine,
        faces,
        imageRefs: faces.flatMap((face, faceIndex) =>
          face.imageUrl
            ? [
                {
                  assetKey: `${keyedDefinitionId}:${faceIndex}:normal`,
                  faceIndex,
                  variant: "normal" as const,
                  url: face.imageUrl,
                },
              ]
            : [],
        ),
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
    for (const token of playerSeed.tokens) {
      const keyedDefinitionId = definitionKey(
        playerSeed.playerId,
        token.definitionId,
      )
      cardDefinitionsById[keyedDefinitionId] = {
        id: keyedDefinitionId,
        name: token.name,
        scryfallId: token.scryfallId,
        typeLine: token.typeLine,
        faces: [
          {
            name: token.name,
            typeLine: token.typeLine,
            imageUrl: token.imageUrl,
          },
        ],
        imageRefs: token.imageUrl
          ? [
              {
                assetKey: `${keyedDefinitionId}:0:normal`,
                faceIndex: 0,
                variant: "normal",
                url: token.imageUrl,
              },
            ]
          : [],
        token: {
          kind: token.kind,
          name: token.name,
          power: token.power,
          toughness: token.toughness,
          source: "deck",
        },
      }
    }
    player.zones.library = shuffle(player.zones.library, options.random)
  }

  let game: AuthoritativeGameState = {
    schemaVersion: 4,
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
    libraryRevealCounts: Object.fromEntries(
      turnOrder.map(playerId => [playerId, 0]),
    ),
    players,
    playerUids,
    cardDefinitionsById,
    cardsById,
    groupsById: {},
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
    schemaVersion: 1 | 2 | 3 | 4
    openingHands?: GameState["openingHands"]
    phase?: GameState["phase"]
    matchStatus?: GameState["matchStatus"]
    libraryRevealCounts?: Record<PlayerId, number>
  }
  if (
    legacy.schemaVersion === 4 &&
    legacy.openingHands &&
    legacy.phase &&
    legacy.matchStatus &&
    legacy.libraryRevealCounts
  ) {
    return state
  }
  return {
    ...state,
    schemaVersion: 4,
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
    libraryRevealCounts:
      legacy.libraryRevealCounts ??
      Object.fromEntries(state.turnOrder.map(playerId => [playerId, 0])),
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

  if (command.type === "REVEAL_LIBRARY") {
    return {
      accepted: true,
      state: {
        ...state,
        updatedAt: now,
        libraryRevealCounts: {
          ...state.libraryRevealCounts,
          [playerId]: Math.min(
            command.payload.amount,
            state.players[playerId]?.zones.library.length ?? 0,
          ),
        },
      },
    }
  }

  if (command.type === "HIDE_LIBRARY") {
    return {
      accepted: true,
      state: {
        ...state,
        updatedAt: now,
        libraryRevealCounts: {
          ...state.libraryRevealCounts,
          [playerId]: 0,
        },
      },
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
    case "MOVE_CARDS": {
      const invalid = command.payload.moves.some(move => {
        const card = state.cardsById[move.instanceId]
        return (
          card?.controllerId !== playerId ||
          card.ownerId !== playerId ||
          !state.players[playerId]?.zones[card.zone].includes(card.instanceId)
        )
      })
      if (invalid) {
        return {
          accepted: false,
          code: "INVALID_COMMAND",
          message: "De selectie bevat een kaart die je niet mag verplaatsen.",
        }
      }
      nextCore = moveCards(
        core,
        command.payload.moves.map(move => ({ ...move, playerId })),
        now,
      )
      break
    }
    case "MOVE_CARD_IN_LIBRARY": {
      const card = state.cardsById[command.payload.instanceId]
      if (
        card?.ownerId !== playerId ||
        card.controllerId !== playerId ||
        card.zone !== "library"
      ) {
        return {
          accepted: false,
          code: "INVALID_COMMAND",
          message: "Alleen een eigen librarykaart kan worden herschikt.",
        }
      }
      nextCore = moveCardToLibraryPosition(
        core,
        card.instanceId,
        playerId,
        command.payload.position,
        now,
      )
      break
    }
    case "SET_COUNTER": {
      const card = state.cardsById[command.payload.instanceId]
      if (card?.controllerId !== playerId || card.zone !== "battlefield") {
        return {
          accepted: false,
          code: "INVALID_COMMAND",
          message: "Counters kunnen alleen op een eigen permanent staan.",
        }
      }
      nextCore = setCardCounter(
        core,
        card.instanceId,
        command.payload.counter,
        command.payload.value,
        now,
      )
      break
    }
    case "SWITCH_FACE": {
      const card = state.cardsById[command.payload.instanceId]
      if (card?.controllerId !== playerId) {
        return {
          accepted: false,
          code: "INVALID_COMMAND",
          message: "Alleen een eigen kaart kan van zijde wisselen.",
        }
      }
      nextCore = switchCardFace(core, card.instanceId, now)
      break
    }
    case "SET_STACK_ORDER": {
      const card = state.cardsById[command.payload.instanceId]
      if (card?.controllerId !== playerId || card.zone !== "battlefield") {
        return {
          accepted: false,
          code: "INVALID_COMMAND",
          message:
            "Alleen een eigen permanent kan van stapelvolgorde wijzigen.",
        }
      }
      nextCore = setCardStackOrder(
        core,
        card.instanceId,
        command.payload.direction,
        now,
      )
      break
    }
    case "ATTACH_CARD": {
      const attachment = state.cardsById[command.payload.attachmentId]
      const target = state.cardsById[command.payload.targetId]
      if (
        attachment?.controllerId !== playerId ||
        target?.controllerId !== playerId
      ) {
        return {
          accepted: false,
          code: "INVALID_COMMAND",
          message: "Alleen eigen permanents kunnen worden gekoppeld.",
        }
      }
      nextCore = attachCard(core, attachment.instanceId, target.instanceId, now)
      break
    }
    case "DETACH_CARD": {
      const attachment = state.cardsById[command.payload.attachmentId]
      if (attachment?.controllerId !== playerId) {
        return {
          accepted: false,
          code: "INVALID_COMMAND",
          message: "Alleen een eigen permanent kan worden losgemaakt.",
        }
      }
      nextCore = detachCard(core, attachment.instanceId, now)
      break
    }
    case "DUPLICATE_TOKEN": {
      const token = state.cardsById[command.payload.instanceId]
      if (token?.controllerId !== playerId) {
        return {
          accepted: false,
          code: "INVALID_COMMAND",
          message: "Alleen een eigen token kan worden gedupliceerd.",
        }
      }
      nextCore = duplicateToken(core, token.instanceId, options.createId, now)
      break
    }
    case "CREATE_GROUP": {
      const invalid = command.payload.cardIds.some(instanceId => {
        const card = state.cardsById[instanceId]
        return card?.controllerId !== playerId || card.zone !== "battlefield"
      })
      if (invalid) {
        return {
          accepted: false,
          code: "INVALID_COMMAND",
          message: "Een groep kan alleen eigen permanents bevatten.",
        }
      }
      nextCore = createCardGroup(
        core,
        {
          groupId: options.createId("group"),
          playerId,
          cardIds: command.payload.cardIds,
          name: command.payload.name,
        },
        now,
      )
      break
    }
    case "ADD_TO_GROUP": {
      const group = core.groupsById[command.payload.groupId]
      const invalidCard = command.payload.cardIds.some(instanceId => {
        const card = state.cardsById[instanceId]
        return card?.controllerId !== playerId || card.zone !== "battlefield"
      })
      if (group?.playerId !== playerId || invalidCard) {
        return {
          accepted: false,
          code: "INVALID_COMMAND",
          message: "Deze kaartgroep is niet van jou.",
        }
      }
      nextCore = addCardsToGroup(core, group.id, command.payload.cardIds, now)
      break
    }
    case "REMOVE_FROM_GROUP": {
      const group = core.groupsById[command.payload.groupId]
      if (group?.playerId !== playerId) {
        return {
          accepted: false,
          code: "INVALID_COMMAND",
          message: "Deze kaartgroep is niet van jou.",
        }
      }
      nextCore = removeCardsFromGroup(
        core,
        group.id,
        command.payload.cardIds,
        now,
      )
      break
    }
    case "UPDATE_GROUP": {
      const group = core.groupsById[command.payload.groupId]
      if (group?.playerId !== playerId) {
        return {
          accepted: false,
          code: "INVALID_COMMAND",
          message: "Deze kaartgroep is niet van jou.",
        }
      }
      nextCore = updateCardGroup(core, group.id, command.payload, now)
      break
    }
    case "MOVE_GROUP": {
      const group = core.groupsById[command.payload.groupId]
      if (group?.playerId !== playerId) {
        return {
          accepted: false,
          code: "INVALID_COMMAND",
          message: "Deze kaartgroep is niet van jou.",
        }
      }
      nextCore = moveCardGroup(core, group.id, command.payload.position, now)
      break
    }
    case "DISSOLVE_GROUP": {
      const group = core.groupsById[command.payload.groupId]
      if (group?.playerId !== playerId) {
        return {
          accepted: false,
          code: "INVALID_COMMAND",
          message: "Deze kaartgroep is niet van jou.",
        }
      }
      nextCore = dissolveCardGroup(core, group.id, now)
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
    case "UNTAP_ALL":
      nextCore = untapAllCards(core, playerId, now)
      break
    case "CREATE_TOKEN": {
      const submittedToken = command.payload.token
      const knownDefinitionId = definitionKey(
        playerId,
        submittedToken.definitionId,
      )
      const knownDefinition =
        state.cardDefinitionsById[submittedToken.definitionId] ??
        state.cardDefinitionsById[knownDefinitionId]
      nextCore =
        knownDefinition?.token && knownDefinition.id.startsWith(`${playerId}:`)
          ? createKnownToken(core, {
              playerId,
              definitionId: knownDefinition.id,
              instanceId: options.createId("online-token"),
              position: command.payload.position,
              now,
            })
          : createToken(core, {
              playerId,
              kind: submittedToken.kind,
              name: submittedToken.name,
              typeLine: submittedToken.typeLine,
              imageUrl: submittedToken.imageUrl,
              scryfallId: submittedToken.scryfallId,
              power: submittedToken.power,
              toughness: submittedToken.toughness,
              position: command.payload.position,
              createId: options.createId,
              now,
            })
      break
    }
    case "CHANGE_TRACKER":
      nextCore = changePlayerTracker(
        core,
        playerId,
        command.payload.tracker,
        command.payload.delta,
        now,
      )
      break
    case "SET_TRACKER_VISIBILITY":
      nextCore = setPlayerTrackerVisibility(
        core,
        playerId,
        command.payload.tracker,
        command.payload.visible,
        now,
      )
      break
    case "SET_CITYS_BLESSING":
      nextCore = setPlayerCitysBlessing(
        core,
        playerId,
        command.payload.active,
        now,
      )
      break
    case "SET_PLAYER_DISABLED":
      nextCore = setPlayerDisabled(
        core,
        playerId,
        command.payload.disabled,
        now,
      )
      break
    case "CHANGE_COMMANDER_TAX":
      nextCore = changeCommanderTax(
        core,
        playerId,
        command.payload.commanderId,
        command.payload.delta,
        now,
      )
      break
    case "CHANGE_COMMANDER_DAMAGE":
      nextCore = changeCommanderDamage(
        core,
        playerId,
        command.payload.commanderId,
        command.payload.delta,
        now,
      )
      break
    case "PASS_TURN":
      return applyPassTurn(state, playerId, now)
    case "TOGGLE_TAP": {
      const instanceIds =
        "instanceIds" in command.payload
          ? command.payload.instanceIds
          : [command.payload.instanceId]
      const cards = instanceIds.map(instanceId => state.cardsById[instanceId])
      if (
        cards.some(
          card =>
            card?.controllerId !== playerId || card.zone !== "battlefield",
        )
      ) {
        return {
          accepted: false,
          code: "INVALID_COMMAND",
          message:
            "Alleen een eigen kaart op het battlefield kan worden getapt.",
        }
      }
      nextCore =
        instanceIds.length === 1
          ? toggleCardTapped(core, instanceIds[0] ?? "", now)
          : toggleCardsTapped(core, instanceIds, now)
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
    faces: definition.faces.map((face, faceIndex) => ({
      name: face.name,
      typeLine: face.typeLine,
      imageUrl:
        face.imageUrl ??
        definition.imageRefs.find(ref => ref.faceIndex === faceIndex)?.url,
    })),
    attachedTo: card.attachedTo,
    position: card.position,
    isCommander: card.isCommander ?? false,
  }
}

const visibleTokenDefinition = (
  definition: CardDefinition,
): OnlineTokenDefinition => {
  const firstFace = definition.faces[0]
  return {
    definitionId: definition.id,
    name: firstFace?.name ?? definition.name,
    typeLine: firstFace?.typeLine ?? definition.typeLine,
    imageUrl:
      firstFace?.imageUrl ??
      definition.imageRefs.find(reference => reference.faceIndex === 0)?.url,
    scryfallId: definition.scryfallId,
    kind: definition.token?.kind ?? "other",
    power: definition.token?.power,
    toughness: definition.token?.toughness,
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
          trackers: player.trackers,
          visibleTrackers: player.visibleTrackers,
          citysBlessing: player.citysBlessing,
          disabled: player.disabled,
          commanderTax: player.commanderTax,
          commanderDamage: player.commanderDamage,
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
          deckSnapshotId: privatePlayer.deckSnapshotId,
          hand: privatePlayer.zones.hand.map(instanceId =>
            visibleCard(state, instanceId),
          ),
          revealedLibraryCards: (() => {
            const revealCount = state.libraryRevealCounts[session.playerId] ?? 0
            if (revealCount === 0) {
              return []
            }
            return privatePlayer.zones.library
              .slice(-revealCount)
              .reverse()
              .map(instanceId => visibleCard(state, instanceId))
          })(),
          availableTokens: Object.values(state.cardDefinitionsById)
            .filter(
              definition =>
                definition.id.startsWith(`${session.playerId}:`) &&
                definition.token?.source === "deck",
            )
            .map(visibleTokenDefinition)
            .sort((first, second) => first.name.localeCompare(second.name)),
        }
      : null

  return personalGameSnapshotSchema.parse({
    type: "PERSONAL_SNAPSHOT",
    mode: "online",
    gameId: state.gameId,
    version: state.version,
    role: session.role,
    isHost: session.isHost,
    activePlayerId: state.activePlayerId,
    turnNumber: state.turnNumber,
    phase: state.phase,
    matchStatus: state.matchStatus,
    turnOrder: state.turnOrder,
    openingHands: state.openingHands,
    players,
    groupsById: state.groupsById ?? {},
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
