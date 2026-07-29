import type {
  ConnectionRole,
  DurableObjectStorage,
  LobbyStatus,
  LobbySummary,
  LobbyVisibility,
  SqlStorage,
} from "./types"

export type LobbyRecord = LobbySummary & {
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

export type AddParticipantResult =
  | { status: "existing"; participant: ParticipantRecord }
  | { status: "inserted"; participant: ParticipantRecord }
  | { status: "full" }
  | { status: "missing" }

export type LobbyStore = {
  listPublic(): LobbySummary[]
  getByCode(code: string): LobbyRecord | null
  getById(gameId: string): LobbyRecord | null
  insertLobbyWithHost(lobby: LobbyRecord, participant: ParticipantRecord): void
  getParticipant(gameId: string, uid: string): ParticipantRecord | null
  listPlayers(gameId: string): ParticipantRecord[]
  addParticipant(
    gameId: string,
    participant: ParticipantRecord,
  ): AddParticipantResult
  setStatus(gameId: string, status: LobbyStatus, updatedAt: string): boolean
}

const toSummary = (row: LobbyRow): LobbySummary => ({
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
    `)
  }

  listPublic() {
    return this.sql
      .exec<LobbyRow>(
        `${lobbySelect}
         WHERE l.visibility = 'public' AND l.status = 'waiting'
         ORDER BY l.created_at DESC LIMIT 50`,
      )
      .toArray()
      .map(toSummary)
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

  insertLobbyWithHost(lobby: LobbyRecord, participant: ParticipantRecord) {
    this.storage.transactionSync(() => {
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
    return this.sql
      .exec<ParticipantRow>(
        `SELECT game_id AS gameId, uid, player_id AS playerId, role,
                display_name AS displayName, seat_number AS seatNumber,
                joined_at AS joinedAt
         FROM lobby_participants
         WHERE game_id = ? AND role = 'player'
         ORDER BY seat_number`,
        gameId,
      )
      .toArray()
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
}
