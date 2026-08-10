import type {
  ConnectionRole,
  DurableObjectStorage,
  LobbyStatus,
  LobbySummary,
  LobbyVisibility,
  SqlStorage,
} from "./types"
import {
  onlineDeckSubmissionSchema,
  type OnlineDeckSubmission,
} from "@mtg/game-protocol"

export type LobbyRecord = Omit<LobbySummary, "viewerRole"> & {
  hostUid: string
  updatedAt: string
}

export type ParticipantRecord = {
  gameId: string
  uid: string
  playerId: string | null
  role: ConnectionRole
  displayName: string
  seatNumber: number | null
  joinedAt: string
}

export type LobbyDeckRecord = {
  gameId: string
  uid: string
  submission: OnlineDeckSubmission
  registeredAt: string
}

type LobbyRow = {
  id: string
  code: string
  title: string
  hostUid: string
  hostDisplayName: string
  format: string
  visibility: LobbyVisibility
  status: LobbyStatus
  playerCount: number
  maxPlayers: number
  createdAt: string
  updatedAt: string
}

type ParticipantRow = ParticipantRecord

type LobbyDeckRow = {
  gameId: string
  uid: string
  deckJson: string
  registeredAt: string
}

type CountRow = { count: number }
type CreationLimitRow = {
  burstStartedAt: number
  burstAttempts: number
  windowStartedAt: number
  windowAttempts: number
}

const readCount = (row: CountRow | undefined) => row?.count ?? 0

export type AddParticipantResult =
  | { status: "existing"; participant: ParticipantRecord }
  | { status: "inserted"; participant: ParticipantRecord }
  | { status: "full" }
  | { status: "missing" }

export type CreateLobbyResult =
  | { status: "inserted" }
  | { status: "waiting-quota" }
  | { status: "rate-limit" }

export type LobbyCleanupResult = {
  startingRecovered: number
  waiting: number
  finished: number
  rateLimitsDeleted: number
}

export type ActivateLobbyResult = "updated" | "quota" | "missing"

export const MAX_WAITING_LOBBIES_PER_UID = 3
export const MAX_ACTIVE_LOBBIES_PER_UID = 3
export const LOBBY_CREATE_BURST_LIMIT = 3
export const LOBBY_CREATE_BURST_WINDOW_MS = 60_000
export const LOBBY_CREATE_WINDOW_LIMIT = 5
export const LOBBY_CREATE_WINDOW_MS = 10 * 60_000
export const WAITING_LOBBY_TTL_MS = 2 * 60 * 60_000
export const STARTING_LOBBY_TIMEOUT_MS = 10 * 60_000
export const FINISHED_LOBBY_RETENTION_MS = 24 * 60 * 60_000

export type LobbyStore = {
  listVisible(waitingCreatedAfter: string, viewerUid?: string): LobbyRecord[]
  getByCode(code: string): LobbyRecord | null
  getById(gameId: string): LobbyRecord | null
  createLobbyWithHost(
    lobby: LobbyRecord,
    participant: ParticipantRecord,
    attemptedAt: number,
  ): CreateLobbyResult
  getParticipant(gameId: string, uid: string): ParticipantRecord | null
  listParticipants(gameId: string): ParticipantRecord[]
  listPlayers(gameId: string): ParticipantRecord[]
  getDeck(gameId: string, uid: string): LobbyDeckRecord | null
  listDecks(gameId: string): LobbyDeckRecord[]
  upsertDeck(record: LobbyDeckRecord): void
  addParticipant(
    gameId: string,
    participant: ParticipantRecord,
  ): AddParticipantResult
  setStatus(gameId: string, status: LobbyStatus, updatedAt: string): boolean
  activateLobby(
    gameId: string,
    hostUid: string,
    updatedAt: string,
  ): ActivateLobbyResult
  reserveLobbyStart(
    gameId: string,
    hostUid: string,
    updatedAt: string,
  ): ActivateLobbyResult
  deleteLobby(gameId: string): boolean
  cleanupExpired(
    startingUpdatedBefore: string,
    waitingCreatedBefore: string,
    finishedUpdatedBefore: string,
  ): LobbyCleanupResult
  nextExpirationAt(): string | null
}

const toSummary = (row: LobbyRow): Omit<LobbySummary, "viewerRole"> => ({
  id: row.id,
  code: row.code,
  title: row.title,
  hostDisplayName: row.hostDisplayName,
  format: row.format,
  visibility: row.visibility,
  status: row.status,
  playerCount: row.playerCount,
  maxPlayers: row.maxPlayers,
  createdAt: row.createdAt,
})

const toRecord = (row: LobbyRow): LobbyRecord => ({
  ...toSummary(row),
  hostUid: row.hostUid,
  updatedAt: row.updatedAt,
})

const lobbySelect = `
  SELECT l.id, l.code, l.title, l.host_uid AS hostUid,
         l.host_display_name AS hostDisplayName, l.format, l.visibility,
         l.status, l.max_players AS maxPlayers, l.created_at AS createdAt,
         l.updated_at AS updatedAt,
         (SELECT COUNT(*) FROM lobby_participants p
          WHERE p.game_id = l.id AND p.role = 'player') AS playerCount
  FROM lobbies l
`

export class SqliteLobbyStore implements LobbyStore {
  private readonly sql: SqlStorage

  constructor(private readonly storage: DurableObjectStorage) {
    this.sql = storage.sql
    this.sql.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS lobbies (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        host_uid TEXT NOT NULL,
        host_display_name TEXT NOT NULL,
        format TEXT NOT NULL,
        visibility TEXT NOT NULL
          CHECK (visibility IN ('public', 'private', 'invite-only')),
        status TEXT NOT NULL
          CHECK (status IN ('waiting', 'starting', 'active', 'finished')),
        max_players INTEGER NOT NULL CHECK (max_players BETWEEN 2 AND 6),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS lobbies_public_list
      ON lobbies (visibility, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS lobbies_host_status_created
      ON lobbies (host_uid, status, created_at);
      CREATE INDEX IF NOT EXISTS lobbies_status_updated
      ON lobbies (status, updated_at);
      CREATE TABLE IF NOT EXISTS lobby_participants (
        game_id TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
        uid TEXT NOT NULL,
        player_id TEXT,
        role TEXT NOT NULL CHECK (role IN ('player', 'spectator')),
        display_name TEXT NOT NULL,
        seat_number INTEGER,
        joined_at TEXT NOT NULL,
        PRIMARY KEY (game_id, uid),
        UNIQUE (game_id, player_id),
        UNIQUE (game_id, seat_number)
      );
      CREATE TABLE IF NOT EXISTS lobby_decks (
        game_id TEXT NOT NULL,
        uid TEXT NOT NULL,
        deck_json TEXT NOT NULL,
        registered_at TEXT NOT NULL,
        PRIMARY KEY (game_id, uid),
        FOREIGN KEY (game_id, uid)
          REFERENCES lobby_participants(game_id, uid) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS lobby_creation_limits (
        uid TEXT PRIMARY KEY,
        burst_started_at INTEGER NOT NULL,
        burst_attempts INTEGER NOT NULL,
        window_started_at INTEGER NOT NULL,
        window_attempts INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS lobby_creation_limits_window
      ON lobby_creation_limits (window_started_at);
    `)
  }

  listVisible(waitingCreatedAfter: string, viewerUid?: string) {
    if (viewerUid) {
      return this.sql
        .exec<LobbyRow>(
          `${lobbySelect}
           WHERE (
             l.visibility = 'public' AND l.status = 'waiting'
             AND l.created_at > ?
           ) OR (
             (
               l.status IN ('starting', 'active')
               OR (l.status = 'waiting' AND l.created_at > ?)
             )
             AND EXISTS (
               SELECT 1 FROM lobby_participants viewer
               WHERE viewer.game_id = l.id AND viewer.uid = ?
             )
           )
           ORDER BY l.created_at DESC LIMIT 50`,
          waitingCreatedAfter,
          waitingCreatedAfter,
          viewerUid,
        )
        .toArray()
        .map(toRecord)
    }
    return this.sql
      .exec<LobbyRow>(
        `${lobbySelect}
         WHERE l.visibility = 'public' AND l.status = 'waiting'
           AND l.created_at > ?
         ORDER BY l.created_at DESC LIMIT 50`,
        waitingCreatedAfter,
      )
      .toArray()
      .map(toRecord)
  }

  getByCode(code: string) {
    const row = this.sql
      .exec<LobbyRow>(`${lobbySelect} WHERE l.code = ? LIMIT 1`, code)
      .toArray()[0]
    return row ? toRecord(row) : null
  }

  getById(gameId: string) {
    const row = this.sql
      .exec<LobbyRow>(`${lobbySelect} WHERE l.id = ? LIMIT 1`, gameId)
      .toArray()[0]
    return row ? toRecord(row) : null
  }

  createLobbyWithHost(
    lobby: LobbyRecord,
    participant: ParticipantRecord,
    attemptedAt: number,
  ): CreateLobbyResult {
    return this.storage.transactionSync(() => {
      const rate = this.sql
        .exec<CreationLimitRow>(
          `SELECT burst_started_at AS burstStartedAt,
                  burst_attempts AS burstAttempts,
                  window_started_at AS windowStartedAt,
                  window_attempts AS windowAttempts
           FROM lobby_creation_limits WHERE uid = ?`,
          lobby.hostUid,
        )
        .toArray()[0]
      const burstAttempts =
        rate && attemptedAt - rate.burstStartedAt < LOBBY_CREATE_BURST_WINDOW_MS
          ? rate.burstAttempts
          : 0
      const windowAttempts =
        rate && attemptedAt - rate.windowStartedAt < LOBBY_CREATE_WINDOW_MS
          ? rate.windowAttempts
          : 0
      if (
        burstAttempts >= LOBBY_CREATE_BURST_LIMIT ||
        windowAttempts >= LOBBY_CREATE_WINDOW_LIMIT
      ) {
        return { status: "rate-limit" }
      }
      this.sql.exec(
        `INSERT INTO lobby_creation_limits
          (uid, burst_started_at, burst_attempts, window_started_at, window_attempts)
         VALUES (?, ?, 1, ?, 1)
         ON CONFLICT (uid) DO UPDATE SET
          burst_started_at = CASE WHEN ? - burst_started_at >= ?
            THEN ? ELSE burst_started_at END,
          burst_attempts = CASE WHEN ? - burst_started_at >= ?
            THEN 1 ELSE burst_attempts + 1 END,
          window_started_at = CASE WHEN ? - window_started_at >= ?
            THEN ? ELSE window_started_at END,
          window_attempts = CASE WHEN ? - window_started_at >= ?
            THEN 1 ELSE window_attempts + 1 END`,
        lobby.hostUid,
        attemptedAt,
        attemptedAt,
        attemptedAt,
        LOBBY_CREATE_BURST_WINDOW_MS,
        attemptedAt,
        attemptedAt,
        LOBBY_CREATE_BURST_WINDOW_MS,
        attemptedAt,
        attemptedAt,
        LOBBY_CREATE_WINDOW_MS,
        attemptedAt,
        attemptedAt,
        LOBBY_CREATE_WINDOW_MS,
      )
      const waiting = readCount(
        this.sql
          .exec<CountRow>(
            `SELECT COUNT(*) AS count FROM lobbies
             WHERE host_uid = ? AND status = 'waiting' AND created_at > ?`,
            lobby.hostUid,
            new Date(attemptedAt - WAITING_LOBBY_TTL_MS).toISOString(),
          )
          .toArray()[0],
      )
      if (waiting >= MAX_WAITING_LOBBIES_PER_UID) {
        return { status: "waiting-quota" }
      }
      this.sql.exec(
        `INSERT INTO lobbies
          (id, code, title, host_uid, host_display_name, format, visibility,
           status, max_players, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        lobby.id,
        lobby.code,
        lobby.title,
        lobby.hostUid,
        lobby.hostDisplayName,
        lobby.format,
        lobby.visibility,
        lobby.status,
        lobby.maxPlayers,
        lobby.createdAt,
        lobby.updatedAt,
      )
      this.insertParticipant(participant)
      return { status: "inserted" }
    })
  }

  getParticipant(gameId: string, uid: string) {
    return (
      this.sql
        .exec<ParticipantRow>(
          `SELECT game_id AS gameId, uid, player_id AS playerId, role,
                  display_name AS displayName, seat_number AS seatNumber,
                  joined_at AS joinedAt
           FROM lobby_participants WHERE game_id = ? AND uid = ?`,
          gameId,
          uid,
        )
        .toArray()[0] ?? null
    )
  }

  listPlayers(gameId: string) {
    return this.listParticipants(gameId).filter(
      participant => participant.role === "player",
    )
  }

  listParticipants(gameId: string) {
    return this.sql
      .exec<ParticipantRow>(
        `SELECT game_id AS gameId, uid, player_id AS playerId, role,
                display_name AS displayName, seat_number AS seatNumber,
                joined_at AS joinedAt
         FROM lobby_participants
         WHERE game_id = ?
         ORDER BY CASE WHEN seat_number IS NULL THEN 1 ELSE 0 END, seat_number,
                  joined_at`,
        gameId,
      )
      .toArray()
  }

  getDeck(gameId: string, uid: string) {
    const row = this.sql
      .exec<LobbyDeckRow>(
        `SELECT game_id AS gameId, uid, deck_json AS deckJson,
                registered_at AS registeredAt
         FROM lobby_decks WHERE game_id = ? AND uid = ?`,
        gameId,
        uid,
      )
      .toArray()[0]
    return row ? this.toDeckRecord(row) : null
  }

  listDecks(gameId: string) {
    return this.sql
      .exec<LobbyDeckRow>(
        `SELECT game_id AS gameId, uid, deck_json AS deckJson,
                registered_at AS registeredAt
         FROM lobby_decks WHERE game_id = ? ORDER BY registered_at`,
        gameId,
      )
      .toArray()
      .map(row => this.toDeckRecord(row))
  }

  upsertDeck(record: LobbyDeckRecord) {
    this.sql.exec(
      `INSERT INTO lobby_decks (game_id, uid, deck_json, registered_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(game_id, uid) DO UPDATE SET
         deck_json = excluded.deck_json,
         registered_at = excluded.registered_at`,
      record.gameId,
      record.uid,
      JSON.stringify(record.submission),
      record.registeredAt,
    )
  }

  addParticipant(
    gameId: string,
    participant: ParticipantRecord,
  ): AddParticipantResult {
    return this.storage.transactionSync(() => {
      const lobby = this.getById(gameId)
      if (!lobby) return { status: "missing" }
      const existing = this.getParticipant(gameId, participant.uid)
      if (existing) return { status: "existing", participant: existing }
      if (
        participant.role === "player" &&
        lobby.playerCount >= lobby.maxPlayers
      ) {
        return { status: "full" }
      }
      this.insertParticipant(participant)
      return { status: "inserted", participant }
    })
  }

  setStatus(gameId: string, status: LobbyStatus, updatedAt: string) {
    const existing = this.getById(gameId)
    if (!existing) return false
    this.sql.exec(
      "UPDATE lobbies SET status = ?, updated_at = ? WHERE id = ?",
      status,
      updatedAt,
      gameId,
    )
    return true
  }

  activateLobby(
    gameId: string,
    hostUid: string,
    updatedAt: string,
  ): ActivateLobbyResult {
    return this.storage.transactionSync(() => {
      const existing = this.getById(gameId)
      if (existing?.hostUid !== hostUid) return "missing"
      const active = readCount(
        this.sql
          .exec<CountRow>(
            `SELECT COUNT(*) AS count FROM lobbies
             WHERE host_uid = ? AND status IN ('starting', 'active')
               AND id <> ?`,
            hostUid,
            gameId,
          )
          .toArray()[0],
      )
      if (active >= MAX_ACTIVE_LOBBIES_PER_UID) return "quota"
      this.sql.exec(
        "UPDATE lobbies SET status = 'active', updated_at = ? WHERE id = ?",
        updatedAt,
        gameId,
      )
      return "updated"
    })
  }

  reserveLobbyStart(
    gameId: string,
    hostUid: string,
    updatedAt: string,
  ): ActivateLobbyResult {
    return this.storage.transactionSync(() => {
      const existing = this.getById(gameId)
      if (existing?.hostUid !== hostUid || existing.status !== "waiting") {
        return "missing"
      }
      const active = readCount(
        this.sql
          .exec<CountRow>(
            `SELECT COUNT(*) AS count FROM lobbies
             WHERE host_uid = ? AND status IN ('starting', 'active')`,
            hostUid,
          )
          .toArray()[0],
      )
      if (active >= MAX_ACTIVE_LOBBIES_PER_UID) return "quota"
      this.sql.exec(
        "UPDATE lobbies SET status = 'starting', updated_at = ? WHERE id = ?",
        updatedAt,
        gameId,
      )
      return "updated"
    })
  }

  deleteLobby(gameId: string) {
    const existing = this.getById(gameId)
    if (!existing) return false
    this.sql.exec("DELETE FROM lobbies WHERE id = ?", gameId)
    return true
  }

  cleanupExpired(
    startingUpdatedBefore: string,
    waitingCreatedBefore: string,
    finishedUpdatedBefore: string,
  ): LobbyCleanupResult {
    return this.storage.transactionSync(() => {
      const startingRecovered = readCount(
        this.sql
          .exec<CountRow>(
            `SELECT COUNT(*) AS count FROM lobbies
             WHERE status = 'starting' AND updated_at <= ?`,
            startingUpdatedBefore,
          )
          .toArray()[0],
      )
      this.sql.exec(
        `UPDATE lobbies SET status = 'waiting', updated_at = ?
         WHERE status = 'starting' AND updated_at <= ?`,
        startingUpdatedBefore,
        startingUpdatedBefore,
      )
      const waiting = readCount(
        this.sql
          .exec<CountRow>(
            `SELECT COUNT(*) AS count FROM lobbies
             WHERE status = 'waiting' AND created_at <= ?`,
            waitingCreatedBefore,
          )
          .toArray()[0],
      )
      const finished = readCount(
        this.sql
          .exec<CountRow>(
            `SELECT COUNT(*) AS count FROM lobbies
             WHERE status = 'finished' AND updated_at <= ?`,
            finishedUpdatedBefore,
          )
          .toArray()[0],
      )
      this.sql.exec(
        `DELETE FROM lobbies
         WHERE (status = 'waiting' AND created_at <= ?)
            OR (status = 'finished' AND updated_at <= ?)`,
        waitingCreatedBefore,
        finishedUpdatedBefore,
      )
      const rateLimitCutoff = Date.parse(finishedUpdatedBefore)
      const rateLimitsDeleted = readCount(
        this.sql
          .exec<CountRow>(
            `SELECT COUNT(*) AS count FROM lobby_creation_limits
             WHERE window_started_at < ?`,
            rateLimitCutoff,
          )
          .toArray()[0],
      )
      this.sql.exec(
        `DELETE FROM lobby_creation_limits WHERE window_started_at < ?`,
        rateLimitCutoff,
      )
      return { startingRecovered, waiting, finished, rateLimitsDeleted }
    })
  }

  nextExpirationAt() {
    const row = this.sql
      .exec<{ expirationAt: string | null }>(
        `SELECT MIN(expiration_at) AS expirationAt FROM (
           SELECT datetime(created_at, '+2 hours') AS expiration_at
           FROM lobbies WHERE status = 'waiting'
           UNION ALL
           SELECT datetime(updated_at, '+10 minutes') AS expiration_at
           FROM lobbies WHERE status = 'starting'
           UNION ALL
           SELECT datetime(updated_at, '+24 hours') AS expiration_at
           FROM lobbies WHERE status = 'finished'
         )`,
      )
      .toArray()[0]
    return row?.expirationAt
      ? new Date(`${row.expirationAt}Z`).toISOString()
      : null
  }

  private insertParticipant(participant: ParticipantRecord) {
    this.sql.exec(
      `INSERT INTO lobby_participants
        (game_id, uid, player_id, role, display_name, seat_number, joined_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      participant.gameId,
      participant.uid,
      participant.playerId,
      participant.role,
      participant.displayName,
      participant.seatNumber,
      participant.joinedAt,
    )
  }

  private toDeckRecord(row: LobbyDeckRow): LobbyDeckRecord {
    return {
      gameId: row.gameId,
      uid: row.uid,
      submission: onlineDeckSubmissionSchema.parse(JSON.parse(row.deckJson)),
      registeredAt: row.registeredAt,
    }
  }
}
