import { z } from "zod"
import type { GameState, PersistedGame, PlayerId } from "./types"

const playerIdSchema = z.enum(["player-1", "player-2"])
const openingHandStateSchema = z.object({
  mulliganCount: z.number().int().nonnegative(),
  kept: z.boolean(),
})

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
const currentGameSchema = z
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
const currentPersistedGameSchema = persistedGameSchema(4, currentGameSchema)

const keptOpeningHands: GameState["openingHands"] = {
  "player-1": { mulliganCount: 0, kept: true },
  "player-2": { mulliganCount: 0, kept: true },
}

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
    schemaVersion: 4,
    activePlayerId: game.activePlayerId ?? "player-1",
    turnNumber: game.turnNumber ?? 1,
    phase: "beginning",
    openingHands,
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
  schemaVersion: 4,
  game: migrateGame(record.game, openingHandsFor(record.game)),
  past: record.past.map(game => migrateGame(game, openingHandsFor(game))),
  future: record.future.map(game => migrateGame(game, openingHandsFor(game))),
  savedAt: record.savedAt,
})

const existingOpeningHands = (game: LegacyGame): GameState["openingHands"] =>
  (game.openingHands as GameState["openingHands"]) ??
  structuredClone(keptOpeningHands)

export const hydratePersistedGame = (value: unknown): PersistedGame => {
  const current = currentPersistedGameSchema.safeParse(value)
  if (current.success) return current.data as PersistedGame

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
