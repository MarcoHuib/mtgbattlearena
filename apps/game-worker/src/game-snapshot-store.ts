import { z } from "zod"
import type { AuthoritativeGameState } from "./game-server-adapter"
import type { DurableObjectStorage, SqlStorage } from "./types"

export type StoredGameRecord = {
  game: AuthoritativeGameState
  processedCommands: Record<string, number>
}

type SnapshotRow = {
  payload: string
}

const storedGameRecordSchema = z
  .object({
    game: z
      .object({
        schemaVersion: z.union([
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(4),
          z.literal(5),
          z.literal(6),
        ]),
        mode: z.literal("online"),
        gameId: z.string().min(1),
        version: z.number().int().nonnegative(),
        turnOrder: z.array(z.string().min(1)).min(2).max(6),
        activePlayerId: z.string().min(1),
        players: z.record(z.string(), z.unknown()),
        playerUids: z.record(z.string(), z.string()),
        cardDefinitionsById: z.record(z.string(), z.unknown()),
        cardsById: z.record(z.string(), z.unknown()),
      })
      .loose(),
    processedCommands: z.record(z.string(), z.number().int().nonnegative()),
  })
  .strict()

export type GameSnapshotStore = {
  load(): StoredGameRecord | null
  save(record: StoredGameRecord, serialized?: string): void
}

export class SqliteGameSnapshotStore implements GameSnapshotStore {
  private readonly sql: SqlStorage

  constructor(storage: DurableObjectStorage) {
    this.sql = storage.sql
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS game_snapshots (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        schema_version INTEGER NOT NULL,
        state_version INTEGER NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
  }

  load(): StoredGameRecord | null {
    const row = this.sql
      .exec<SnapshotRow>(
        "SELECT payload FROM game_snapshots WHERE singleton = 1",
      )
      .toArray()[0]
    if (!row) return null
    return storedGameRecordSchema.parse(
      JSON.parse(row.payload),
    ) as unknown as StoredGameRecord
  }

  save(record: StoredGameRecord, serialized = JSON.stringify(record)) {
    this.sql.exec(
      `INSERT INTO game_snapshots
        (singleton, schema_version, state_version, payload, updated_at)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(singleton) DO UPDATE SET
         schema_version = excluded.schema_version,
         state_version = excluded.state_version,
         payload = excluded.payload,
         updated_at = excluded.updated_at`,
      record.game.schemaVersion,
      record.game.version,
      serialized,
      record.game.updatedAt,
    )
  }
}
