import { z } from "zod"
import type { GameState, PersistedGame, PlayerId } from "./types"

const playerIdSchema = z.enum(["player-1", "player-2"])
const openingHandStateSchema = z.object({
  mulliganCount: z.number().int().nonnegative(),
  kept: z.boolean(),
})
const playerStatusSchema = z
  .object({
    trackers: z.object({
      energy: z.number().int().nonnegative(),
      experience: z.number().int().nonnegative(),
      rad: z.number().int().nonnegative(),
    }),
    visibleTrackers: z.object({
      energy: z.boolean(),
      experience: z.boolean(),
      rad: z.boolean(),
    }),
    citysBlessing: z.boolean(),
    disabled: z.boolean(),
  })
  .loose()

const versionOneGameSchema = z.object({ schemaVersion: z.literal(1) }).loose()
const versionTwoGameSchema = z
  .object({
    schemaVersion: z.literal(2),
    activePlayerId: playerIdSchema,
    turnNumber: z.number().int().positive(),
  })
  .loose()
const versionThreeGameSchema = z
  .object({
    schemaVersion: z.literal(3),
    activePlayerId: playerIdSchema,
    turnNumber: z.number().int().positive(),
    openingHands: z.object({
      "player-1": openingHandStateSchema,
      "player-2": openingHandStateSchema,
    }),
  })
  .loose()
const versionFourGameSchema = z
  .object({
    schemaVersion: z.literal(4),
    activePlayerId: playerIdSchema,
    turnNumber: z.number().int().positive(),
    phase: z.enum([
      "beginning",
      "precombat-main",
      "combat",
      "postcombat-main",
      "ending",
    ]),
    openingHands: z.object({
      "player-1": openingHandStateSchema,
      "player-2": openingHandStateSchema,
    }),
  })
  .loose()
const versionFiveGameSchema = z
  .object({
    schemaVersion: z.literal(5),
    activePlayerId: playerIdSchema,
    turnNumber: z.number().int().positive(),
    groupsById: z.record(z.string(), z.unknown()),
  })
  .loose()
const versionSixGameSchema = z
  .object({
    schemaVersion: z.literal(6),
    activePlayerId: playerIdSchema,
    turnNumber: z.number().int().positive(),
    groupsById: z.record(z.string(), z.unknown()),
    matchStatus: z.object({
      monarchPlayerId: playerIdSchema.nullable(),
      initiativePlayerId: playerIdSchema.nullable(),
      dayNight: z.enum(["none", "day", "night"]),
    }),
    players: z.object({
      "player-1": playerStatusSchema,
      "player-2": playerStatusSchema,
    }),
  })
  .loose()
const currentPlayerIdSchema = z.string().min(1)
const currentGameSchema = z
  .object({
    schemaVersion: z.literal(7),
    activePlayerId: currentPlayerIdSchema,
    turnNumber: z.number().int().positive(),
    groupsById: z.record(z.string(), z.unknown()),
    openingHands: z.record(currentPlayerIdSchema, openingHandStateSchema),
    deckSnapshotIds: z.array(z.string()).min(2).max(6),
    players: z.record(currentPlayerIdSchema, playerStatusSchema),
    matchStatus: z.object({
      monarchPlayerId: currentPlayerIdSchema.nullable(),
      initiativePlayerId: currentPlayerIdSchema.nullable(),
      dayNight: z.enum(["none", "day", "night"]),
    }),
    firstPlayerRoll: z.object({
      status: z.enum(["rolling", "tie", "winner_determined", "completed"]),
      round: z.number().int().positive(),
      participantIds: z.array(currentPlayerIdSchema).min(2).max(6),
      eligiblePlayerIds: z.array(currentPlayerIdSchema),
      rolls: z.record(
        currentPlayerIdSchema,
        z.number().int().min(1).max(20),
      ),
      eliminatedPlayerIds: z.array(currentPlayerIdSchema),
      tiedPlayerIds: z.array(currentPlayerIdSchema),
      winnerPlayerId: currentPlayerIdSchema.nullable(),
      startPlayerId: currentPlayerIdSchema.nullable(),
      rollSequence: z.number().int().nonnegative(),
    }),
  })
  .loose()

const persistedGameSchema = <T extends z.ZodType>(version: number, game: T) =>
  z.object({
    schemaVersion: z.literal(version),
    game,
    past: z.array(game),
    future: z.array(game),
    savedAt: z.string(),
  })

const versionOnePersistedGameSchema = persistedGameSchema(
  1,
  versionOneGameSchema,
)
const versionTwoPersistedGameSchema = persistedGameSchema(
  2,
  versionTwoGameSchema,
)
const versionThreePersistedGameSchema = persistedGameSchema(
  3,
  versionThreeGameSchema,
)
const versionFourPersistedGameSchema = persistedGameSchema(
  4,
  versionFourGameSchema,
)
const versionFivePersistedGameSchema = persistedGameSchema(
  5,
  versionFiveGameSchema,
)
const versionSixPersistedGameSchema = persistedGameSchema(
  6,
  versionSixGameSchema,
)
const currentPersistedGameSchema = persistedGameSchema(7, currentGameSchema)

const keptOpeningHands: GameState["openingHands"] = {
  "player-1": { mulliganCount: 0, kept: true },
  "player-2": { mulliganCount: 0, kept: true },
}

const completedFirstPlayerRoll = (
  activePlayerId: PlayerId,
): GameState["firstPlayerRoll"] => ({
  status: "completed",
  round: 1,
  participantIds: ["player-1", "player-2"],
  eligiblePlayerIds: [],
  rolls: {},
  eliminatedPlayerIds: [],
  tiedPlayerIds: [],
  winnerPlayerId: activePlayerId,
  startPlayerId: activePlayerId,
  rollSequence: 0,
})

type LegacyGame = Record<string, unknown> & {
  players?: Partial<
    Record<
      PlayerId,
      Record<string, unknown> & {
        life?: number
        zones?: { command?: string[] }
      }
    >
  >
}

const addCommanderDefaults = (game: LegacyGame): LegacyGame => {
  if (!game.players) return game
  const players = { ...game.players }
  for (const playerId of ["player-1", "player-2"] as const) {
    const player = players[playerId]
    if (!player) continue
    players[playerId] = {
      ...player,
      life: player.life ?? 40,
      poison: 0,
      trackers: { energy: 0, experience: 0, rad: 0 },
      visibleTrackers: { energy: false, experience: false, rad: false },
      citysBlessing: false,
      disabled: false,
      commanderTax: Object.fromEntries(
        (player.zones?.command ?? []).map(instanceId => [instanceId, 0]),
      ),
      commanderDamage: {},
    }
  }
  return { ...game, players }
}

const migrateGame = (
  game: LegacyGame,
  openingHands: GameState["openingHands"],
): GameState =>
  ({
    ...addCommanderDefaults(game),
    schemaVersion: 7,
    activePlayerId: game.activePlayerId ?? "player-1",
    turnNumber: game.turnNumber ?? 1,
    phase: "beginning",
    openingHands,
    firstPlayerRoll: completedFirstPlayerRoll(
      (game.activePlayerId as PlayerId | undefined) ?? "player-1",
    ),
    groupsById: {},
    matchStatus: {
      monarchPlayerId: null,
      initiativePlayerId: null,
      dayNight: "none",
    },
  }) as GameState

const migrateLegacyRecord = (
  record: {
    game: LegacyGame
    past: LegacyGame[]
    future: LegacyGame[]
    savedAt: string
  },
  openingHandsFor: (game: LegacyGame) => GameState["openingHands"],
): PersistedGame => ({
  schemaVersion: 7,
  game: migrateGame(record.game, openingHandsFor(record.game)),
  past: record.past.map(game => migrateGame(game, openingHandsFor(game))),
  future: record.future.map(game => migrateGame(game, openingHandsFor(game))),
  savedAt: record.savedAt,
})

const existingOpeningHands = (game: LegacyGame): GameState["openingHands"] =>
  (game.openingHands as GameState["openingHands"]) ??
  structuredClone(keptOpeningHands)

const migrateVersionFourGame = (
  game: LegacyGame,
): Omit<GameState, "schemaVersion" | "matchStatus"> & {
  schemaVersion: 5
} => {
  const cardsById = {
    ...((game.cardsById as GameState["cardsById"] | undefined) ?? {}),
  }
  for (const [instanceId, card] of Object.entries(cardsById)) {
    const target = card.attachedTo ? cardsById[card.attachedTo] : undefined
    if (
      card.attachedTo &&
      (card.zone !== "battlefield" ||
        target?.zone !== "battlefield" ||
        card.attachedTo === instanceId)
    ) {
      cardsById[instanceId] = { ...card, attachedTo: undefined }
    }
  }
  for (const [instanceId, card] of Object.entries(cardsById)) {
    const visited = new Set([instanceId])
    let targetId = card.attachedTo
    while (targetId) {
      if (visited.has(targetId)) {
        cardsById[instanceId] = { ...card, attachedTo: undefined }
        break
      }
      visited.add(targetId)
      targetId = cardsById[targetId]?.attachedTo
    }
  }
  return {
    ...(game as unknown as Omit<
      GameState,
      "schemaVersion" | "groupsById" | "matchStatus"
    >),
    schemaVersion: 5,
    cardsById,
    groupsById: {},
  }
}

const migrateVersionFiveGame = (game: LegacyGame): GameState => {
  const players = { ...game.players }
  for (const playerId of ["player-1", "player-2"] as const) {
    const player = players[playerId]
    if (!player) continue
    players[playerId] = {
      ...player,
      trackers: { energy: 0, experience: 0, rad: 0 },
      visibleTrackers: { energy: false, experience: false, rad: false },
      citysBlessing: false,
      disabled: false,
    }
  }
  return {
    ...(game as unknown as Omit<GameState, "schemaVersion" | "matchStatus">),
    schemaVersion: 7,
    players: players as GameState["players"],
    matchStatus: {
      monarchPlayerId: null,
      initiativePlayerId: null,
      dayNight: "none",
    },
    firstPlayerRoll: completedFirstPlayerRoll(
      (game.activePlayerId as PlayerId | undefined) ?? "player-1",
    ),
  }
}

const migrateVersionSixGame = (game: LegacyGame): GameState => {
  const activePlayerId =
    (game.activePlayerId as PlayerId | undefined) ?? "player-1"
  return {
    ...(game as unknown as Omit<
      GameState,
      "schemaVersion" | "firstPlayerRoll"
    >),
    schemaVersion: 7,
    firstPlayerRoll: completedFirstPlayerRoll(activePlayerId),
  }
}

export const hydratePersistedGame = (value: unknown): PersistedGame => {
  const current = currentPersistedGameSchema.safeParse(value)
  if (current.success) return current.data as unknown as PersistedGame

  const versionSix = versionSixPersistedGameSchema.safeParse(value)
  if (versionSix.success) {
    return {
      schemaVersion: 7,
      game: migrateVersionSixGame(versionSix.data.game),
      past: versionSix.data.past.map(migrateVersionSixGame),
      future: versionSix.data.future.map(migrateVersionSixGame),
      savedAt: versionSix.data.savedAt,
    }
  }

  const versionFive = versionFivePersistedGameSchema.safeParse(value)
  if (versionFive.success) {
    return {
      schemaVersion: 7,
      game: migrateVersionFiveGame(versionFive.data.game),
      past: versionFive.data.past.map(migrateVersionFiveGame),
      future: versionFive.data.future.map(migrateVersionFiveGame),
      savedAt: versionFive.data.savedAt,
    }
  }

  const versionFour = versionFourPersistedGameSchema.safeParse(value)
  if (versionFour.success) {
    return {
      schemaVersion: 7,
      game: migrateVersionFiveGame(
        migrateVersionFourGame(versionFour.data.game),
      ),
      past: versionFour.data.past.map(game =>
        migrateVersionFiveGame(migrateVersionFourGame(game)),
      ),
      future: versionFour.data.future.map(game =>
        migrateVersionFiveGame(migrateVersionFourGame(game)),
      ),
      savedAt: versionFour.data.savedAt,
    }
  }

  const versionThree = versionThreePersistedGameSchema.safeParse(value)
  if (versionThree.success) {
    return migrateLegacyRecord(versionThree.data, existingOpeningHands)
  }

  const versionTwo = versionTwoPersistedGameSchema.safeParse(value)
  if (versionTwo.success) {
    return migrateLegacyRecord(versionTwo.data, () =>
      structuredClone(keptOpeningHands),
    )
  }

  const versionOne = versionOnePersistedGameSchema.safeParse(value)
  if (versionOne.success) {
    return migrateLegacyRecord(versionOne.data, () =>
      structuredClone(keptOpeningHands),
    )
  }

  throw new Error("Deze lokale savegame heeft een onbekend formaat.")
}
