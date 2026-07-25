import { z } from "zod"
import type { GameState, PersistedGame } from "./types"

const versionOneGameSchema = z.object({ schemaVersion: z.literal(1) }).loose()
const versionTwoGameSchema = z
  .object({
    schemaVersion: z.literal(2),
    activePlayerId: z.enum(["player-1", "player-2"]),
    turnNumber: z.number().int().positive(),
  })
  .loose()
const openingHandStateSchema = z.object({
  mulliganCount: z.number().int().nonnegative(),
  kept: z.boolean(),
})
const currentGameSchema = z
  .object({
    schemaVersion: z.literal(3),
    activePlayerId: z.enum(["player-1", "player-2"]),
    turnNumber: z.number().int().positive(),
    openingHands: z.object({
      "player-1": openingHandStateSchema,
      "player-2": openingHandStateSchema,
    }),
  })
  .loose()

const versionOnePersistedGameSchema = z.object({
  schemaVersion: z.literal(1),
  game: versionOneGameSchema,
  past: z.array(versionOneGameSchema),
  future: z.array(versionOneGameSchema),
  savedAt: z.string(),
})

const versionTwoPersistedGameSchema = z.object({
  schemaVersion: z.literal(2),
  game: versionTwoGameSchema,
  past: z.array(versionTwoGameSchema),
  future: z.array(versionTwoGameSchema),
  savedAt: z.string(),
})

const currentPersistedGameSchema = z.object({
  schemaVersion: z.literal(3),
  game: currentGameSchema,
  past: z.array(currentGameSchema),
  future: z.array(currentGameSchema),
  savedAt: z.string(),
})

const keptOpeningHands: GameState["openingHands"] = {
  "player-1": { mulliganCount: 0, kept: true },
  "player-2": { mulliganCount: 0, kept: true },
}

const migrateVersionOneGame = (
  game: z.infer<typeof versionOneGameSchema>,
): GameState =>
  ({
    ...game,
    schemaVersion: 3,
    activePlayerId: "player-1",
    turnNumber: 1,
    openingHands: structuredClone(keptOpeningHands),
  }) as GameState

const migrateVersionTwoGame = (
  game: z.infer<typeof versionTwoGameSchema>,
): GameState =>
  ({
    ...game,
    schemaVersion: 3,
    openingHands: structuredClone(keptOpeningHands),
  }) as GameState

export const hydratePersistedGame = (value: unknown): PersistedGame => {
  const current = currentPersistedGameSchema.safeParse(value)
  if (current.success) {
    return current.data as PersistedGame
  }
  const versionTwo = versionTwoPersistedGameSchema.safeParse(value)
  if (versionTwo.success) {
    return {
      schemaVersion: 3,
      game: migrateVersionTwoGame(versionTwo.data.game),
      past: versionTwo.data.past.map(migrateVersionTwoGame),
      future: versionTwo.data.future.map(migrateVersionTwoGame),
      savedAt: versionTwo.data.savedAt,
    }
  }
  const versionOne = versionOnePersistedGameSchema.safeParse(value)
  if (versionOne.success) {
    return {
      schemaVersion: 3,
      game: migrateVersionOneGame(versionOne.data.game),
      past: versionOne.data.past.map(migrateVersionOneGame),
      future: versionOne.data.future.map(migrateVersionOneGame),
      savedAt: versionOne.data.savedAt,
    }
  }
  throw new Error("Deze lokale savegame heeft een onbekend formaat.")
}
