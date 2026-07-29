import type { DurableObjectStorage, GameSession, SqlStorage } from "./types"

export type StoredTicket = GameSession & {
  ticketHash: string
  expiresAt: number
  usedAt: number | null
}

export type SocketTicketRepository = {
  save(ticket: StoredTicket): Promise<void>
  consume(ticketHash: string, now: number): Promise<StoredTicket | null>
}

const encodeBase64Url = (bytes: Uint8Array) => {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export const hashSocketTicket = async (ticket: string) => {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(ticket),
  )
  return encodeBase64Url(new Uint8Array(hash))
}

type StoredTicketRow = {
  ticketHash: string
  gameId: string
  uid: string
  playerId: string | null
  role: GameSession["role"]
  isHost: number
  expiresAt: number
  usedAt: number | null
}

export class SqliteSocketTicketRepository implements SocketTicketRepository {
  private readonly sql: SqlStorage

  constructor(private readonly storage: DurableObjectStorage) {
    this.sql = storage.sql
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS socket_tickets (
        ticket_hash TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        uid TEXT NOT NULL,
        player_id TEXT,
        role TEXT NOT NULL CHECK (role IN ('player', 'spectator')),
        is_host INTEGER NOT NULL CHECK (is_host IN (0, 1)),
        expires_at INTEGER NOT NULL,
        used_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS socket_tickets_expiry
      ON socket_tickets (expires_at);
    `)
  }

  save(ticket: StoredTicket) {
    this.sql.exec(
      `INSERT INTO socket_tickets
        (ticket_hash, game_id, uid, player_id, role, is_host, expires_at, used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      ticket.ticketHash,
      ticket.gameId,
      ticket.uid,
      ticket.playerId,
      ticket.role,
      ticket.isHost ? 1 : 0,
      ticket.expiresAt,
    )
    return Promise.resolve()
  }

  consume(ticketHash: string, now: number) {
    const consumed = this.storage.transactionSync(() => {
      const record = this.sql
        .exec<StoredTicketRow>(
          `SELECT ticket_hash AS ticketHash, game_id AS gameId, uid,
                  player_id AS playerId, role, is_host AS isHost,
                  expires_at AS expiresAt, used_at AS usedAt
           FROM socket_tickets WHERE ticket_hash = ?`,
          ticketHash,
        )
        .toArray()[0]
      if (record?.usedAt !== null || (record?.expiresAt ?? 0) <= now) {
        return null
      }
      this.sql.exec(
        `UPDATE socket_tickets SET used_at = ?
         WHERE ticket_hash = ? AND used_at IS NULL AND expires_at > ?`,
        now,
        ticketHash,
        now,
      )
      return {
        ticketHash: record.ticketHash,
        gameId: record.gameId,
        uid: record.uid,
        playerId: record.playerId,
        role: record.role,
        isHost: record.isHost === 1,
        expiresAt: record.expiresAt,
        usedAt: now,
      } satisfies StoredTicket
    })
    return Promise.resolve(consumed)
  }
}

export class MemorySocketTicketRepository implements SocketTicketRepository {
  private readonly tickets = new Map<string, StoredTicket>()

  save(ticket: StoredTicket) {
    this.tickets.set(ticket.ticketHash, structuredClone(ticket))
    return Promise.resolve()
  }

  consume(ticketHash: string, now: number) {
    const ticket = this.tickets.get(ticketHash)
    if (ticket === undefined) return Promise.resolve(null)
    if (ticket.usedAt !== null || ticket.expiresAt <= now) {
      return Promise.resolve(null)
    }
    ticket.usedAt = now
    return Promise.resolve(structuredClone(ticket))
  }
}

export class SocketTicketService {
  constructor(
    private readonly repository: SocketTicketRepository,
    private readonly now: () => number = Date.now,
  ) {}

  async issue(session: GameSession, ttlMilliseconds = 30_000) {
    const raw = crypto.getRandomValues(new Uint8Array(32))
    const ticket = encodeBase64Url(raw)
    const expiresAt = this.now() + ttlMilliseconds
    await this.repository.save({
      ...session,
      ticketHash: await hashSocketTicket(ticket),
      expiresAt,
      usedAt: null,
    })
    return { ticket, expiresAt: new Date(expiresAt).toISOString() }
  }

  async consume(ticket: string) {
    if (ticket.length < 32 || ticket.length > 128) return null
    return this.repository.consume(await hashSocketTicket(ticket), this.now())
  }
}
