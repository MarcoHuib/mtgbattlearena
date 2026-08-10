import type {
  AuthoritativeGameState,
  OnlineGameSeed,
} from "./game-server-adapter"
import { serializePersonalSnapshot } from "./game-server-adapter"
import type { StoredGameRecord } from "./game-snapshot-store"
import type { DurableObjectStorage, GameSession, SqlStorage } from "./types"

export const MAX_WEBSOCKETS_PER_UID = 2
export const MAX_SPECTATOR_WEBSOCKETS = 20
export const GAME_COMMAND_LIMIT = 30
export const GAME_COMMAND_WINDOW_MS = 10_000
export const MAX_GAME_COMMAND_MESSAGE_BYTES = 16 * 1024
export const MAX_GAME_CARD_INSTANCES = 2_500
export const MAX_GAME_CARD_DEFINITIONS = 1_000
export const MAX_GAME_GROUPS = 500
export const MAX_COUNTER_TYPES_PER_CARD = 32
export const MAX_SERIALIZED_GAME_STATE_BYTES = 4 * 1024 * 1024
export const MAX_SERIALIZED_PERSONAL_SNAPSHOT_BYTES = 4 * 1024 * 1024

export type ConnectionLimitCode =
  "WEBSOCKET_CONNECTION_LIMIT_REACHED" | "SPECTATOR_CONNECTION_LIMIT_REACHED"

export const connectionLimitViolation = (
  activeSessions: GameSession[],
  incoming: GameSession,
): ConnectionLimitCode | null => {
  const sameUser = activeSessions.filter(
    session =>
      session.gameId === incoming.gameId && session.uid === incoming.uid,
  ).length
  if (sameUser >= MAX_WEBSOCKETS_PER_UID) {
    return "WEBSOCKET_CONNECTION_LIMIT_REACHED"
  }
  if (
    incoming.role === "spectator" &&
    activeSessions.filter(
      session =>
        session.gameId === incoming.gameId && session.role === "spectator",
    ).length >= MAX_SPECTATOR_WEBSOCKETS
  ) {
    return "SPECTATOR_CONNECTION_LIMIT_REACHED"
  }
  return null
}

export type CommandRateLimiter = {
  attempt(uid: string, now: number): boolean
}

type RateRow = { windowStartedAt: number; attempts: number }

export class SqliteCommandRateLimiter implements CommandRateLimiter {
  private readonly sql: SqlStorage
  private nextCleanupAt = 0

  constructor(private readonly storage: DurableObjectStorage) {
    this.sql = storage.sql
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS game_command_rate_limits (
        uid TEXT PRIMARY KEY,
        window_started_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS game_command_rate_limits_window
      ON game_command_rate_limits (window_started_at);
    `)
  }

  attempt(uid: string, now: number) {
    return this.storage.transactionSync(() => {
      if (now >= this.nextCleanupAt) {
        this.sql.exec(
          `DELETE FROM game_command_rate_limits WHERE window_started_at < ?`,
          now - GAME_COMMAND_WINDOW_MS,
        )
        this.nextCleanupAt = now + GAME_COMMAND_WINDOW_MS
      }
      const current = this.sql
        .exec<RateRow>(
          `SELECT window_started_at AS windowStartedAt, attempts
           FROM game_command_rate_limits WHERE uid = ?`,
          uid,
        )
        .toArray()[0]
      if (
        current &&
        now - current.windowStartedAt < GAME_COMMAND_WINDOW_MS &&
        current.attempts >= GAME_COMMAND_LIMIT
      ) {
        return false
      }
      this.sql.exec(
        `INSERT INTO game_command_rate_limits
          (uid, window_started_at, attempts) VALUES (?, ?, 1)
         ON CONFLICT (uid) DO UPDATE SET
          window_started_at = CASE WHEN ? - window_started_at >= ?
            THEN ? ELSE window_started_at END,
          attempts = CASE WHEN ? - window_started_at >= ?
            THEN 1 ELSE attempts + 1 END`,
        uid,
        now,
        now,
        GAME_COMMAND_WINDOW_MS,
        now,
        now,
        GAME_COMMAND_WINDOW_MS,
      )
      return true
    })
  }
}

export class MemoryCommandRateLimiter implements CommandRateLimiter {
  private readonly rates = new Map<string, RateRow>()

  attempt(uid: string, now: number) {
    const current = this.rates.get(uid)
    if (current && now - current.windowStartedAt < GAME_COMMAND_WINDOW_MS) {
      if (current.attempts >= GAME_COMMAND_LIMIT) return false
      current.attempts += 1
      return true
    }
    this.rates.set(uid, { windowStartedAt: now, attempts: 1 })
    for (const [key, rate] of this.rates) {
      if (now - rate.windowStartedAt >= GAME_COMMAND_WINDOW_MS) {
        this.rates.delete(key)
      }
    }
    return true
  }

  get size() {
    return this.rates.size
  }
}

export type GameStateLimitViolation =
  | "card-instances"
  | "card-definitions"
  | "groups"
  | "counter-types"
  | "serialized-bytes"
  | "personal-snapshot-bytes"

export type ValidatedGameRecord =
  | { valid: true; serialized: string; byteLength: number }
  | {
      valid: false
      violation: GameStateLimitViolation
      actual: number
      limit: number
    }

export const validateSeedGrowthLimits = (
  seed: OnlineGameSeed,
): Exclude<ValidatedGameRecord, { valid: true }> | null => {
  const cardInstances = seed.players.reduce(
    (total, player) =>
      total + player.cards.reduce((sum, card) => sum + card.quantity, 0),
    0,
  )
  if (cardInstances > MAX_GAME_CARD_INSTANCES) {
    return {
      valid: false,
      violation: "card-instances",
      actual: cardInstances,
      limit: MAX_GAME_CARD_INSTANCES,
    }
  }
  const seedBytes = new TextEncoder().encode(JSON.stringify(seed)).byteLength
  if (seedBytes > MAX_SERIALIZED_GAME_STATE_BYTES) {
    return {
      valid: false,
      violation: "serialized-bytes",
      actual: seedBytes,
      limit: MAX_SERIALIZED_GAME_STATE_BYTES,
    }
  }
  const definitions = seed.players.reduce(
    (total, player) => total + player.cards.length + player.tokens.length,
    0,
  )
  return definitions > MAX_GAME_CARD_DEFINITIONS
    ? {
        valid: false,
        violation: "card-definitions",
        actual: definitions,
        limit: MAX_GAME_CARD_DEFINITIONS,
      }
    : null
}

export const validateGameRecordLimits = (
  record: StoredGameRecord,
): ValidatedGameRecord => {
  const game: AuthoritativeGameState = record.game
  const cardInstances = Object.keys(game.cardsById).length
  if (cardInstances > MAX_GAME_CARD_INSTANCES) {
    return {
      valid: false,
      violation: "card-instances",
      actual: cardInstances,
      limit: MAX_GAME_CARD_INSTANCES,
    }
  }
  const definitions = Object.keys(game.cardDefinitionsById).length
  if (definitions > MAX_GAME_CARD_DEFINITIONS) {
    return {
      valid: false,
      violation: "card-definitions",
      actual: definitions,
      limit: MAX_GAME_CARD_DEFINITIONS,
    }
  }
  const groups = Object.keys(game.groupsById ?? {}).length
  if (groups > MAX_GAME_GROUPS) {
    return {
      valid: false,
      violation: "groups",
      actual: groups,
      limit: MAX_GAME_GROUPS,
    }
  }
  const counterTypes = Math.max(
    0,
    ...Object.values(game.cardsById).map(
      card => Object.keys(card.counters).length,
    ),
  )
  if (counterTypes > MAX_COUNTER_TYPES_PER_CARD) {
    return {
      valid: false,
      violation: "counter-types",
      actual: counterTypes,
      limit: MAX_COUNTER_TYPES_PER_CARD,
    }
  }
  const serialized = JSON.stringify(record)
  const byteLength = new TextEncoder().encode(serialized).byteLength
  if (byteLength > MAX_SERIALIZED_GAME_STATE_BYTES) {
    return {
      valid: false,
      violation: "serialized-bytes",
      actual: byteLength,
      limit: MAX_SERIALIZED_GAME_STATE_BYTES,
    }
  }
  return { valid: true, serialized, byteLength }
}

export const validatePersonalSnapshotLimits = (
  game: AuthoritativeGameState,
): Exclude<ValidatedGameRecord, { valid: true }> | null => {
  const sessions: GameSession[] = [
    ...game.turnOrder.map(playerId => ({
      gameId: game.gameId,
      uid: game.playerUids[playerId] ?? "",
      playerId,
      role: "player" as const,
      isHost: false,
    })),
    {
      gameId: game.gameId,
      uid: "spectator-size-check",
      playerId: null,
      role: "spectator",
      isHost: false,
    },
  ]
  for (const session of sessions) {
    const serialized = JSON.stringify(serializePersonalSnapshot(game, session))
    const byteLength = new TextEncoder().encode(serialized).byteLength
    if (byteLength > MAX_SERIALIZED_PERSONAL_SNAPSHOT_BYTES) {
      return {
        valid: false,
        violation: "personal-snapshot-bytes",
        actual: byteLength,
        limit: MAX_SERIALIZED_PERSONAL_SNAPSHOT_BYTES,
      }
    }
  }
  return null
}
