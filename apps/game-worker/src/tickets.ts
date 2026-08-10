import type { DurableObjectStorage, GameSession, SqlStorage } from "./types"

export const SOCKET_TICKET_TTL_MS = 30_000
export const SOCKET_TICKET_MAX_OUTSTANDING = 2
export const SOCKET_TICKET_ISSUE_LIMIT = 10
export const SOCKET_TICKET_RATE_WINDOW_MS = 60_000

const CLEANUP_INTERVAL_MS = 30_000

export type StoredTicket = GameSession & {
  ticketHash: string
  expiresAt: number
  usedAt: number | null
}

export type TicketIssueResult = "issued" | "outstanding-limit" | "rate-limit"

export type SocketTicketRepository = {
  issue(ticket: StoredTicket, now: number): Promise<TicketIssueResult>
  consume(ticketHash: string, now: number): Promise<StoredTicket | null>
  cleanup(now: number): Promise<number>
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

type CountRow = { count: number }
type RateLimitRow = { windowStartedAt: number; attempts: number }

export class SqliteSocketTicketRepository implements SocketTicketRepository {
  private readonly sql: SqlStorage
  private nextCleanupAt = 0

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
      CREATE INDEX IF NOT EXISTS socket_tickets_uid_game_expiry
      ON socket_tickets (uid, game_id, expires_at);
      CREATE TABLE IF NOT EXISTS socket_ticket_issue_limits (
        game_id TEXT NOT NULL,
        uid TEXT NOT NULL,
        window_started_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL,
        PRIMARY KEY (game_id, uid)
      );
      CREATE INDEX IF NOT EXISTS socket_ticket_issue_limits_window
      ON socket_ticket_issue_limits (window_started_at);
    `)
  }

  issue(ticket: StoredTicket, now: number) {
    const result = this.storage.transactionSync(() => {
      this.cleanupIfDue(now)
      const rate = this.sql
        .exec<RateLimitRow>(
          `SELECT window_started_at AS windowStartedAt, attempts
           FROM socket_ticket_issue_limits WHERE game_id = ? AND uid = ?`,
          ticket.gameId,
          ticket.uid,
        )
        .toArray()[0]
      const inCurrentWindow =
        rate !== undefined &&
        now - rate.windowStartedAt < SOCKET_TICKET_RATE_WINDOW_MS
      if (inCurrentWindow && rate.attempts >= SOCKET_TICKET_ISSUE_LIMIT) {
        return "rate-limit" as const
      }
      this.sql.exec(
        `INSERT INTO socket_ticket_issue_limits
          (game_id, uid, window_started_at, attempts) VALUES (?, ?, ?, 1)
         ON CONFLICT (game_id, uid) DO UPDATE SET
          window_started_at = CASE
            WHEN ? - window_started_at >= ? THEN ? ELSE window_started_at END,
          attempts = CASE
            WHEN ? - window_started_at >= ? THEN 1 ELSE attempts + 1 END`,
        ticket.gameId,
        ticket.uid,
        now,
        now,
        SOCKET_TICKET_RATE_WINDOW_MS,
        now,
        now,
        SOCKET_TICKET_RATE_WINDOW_MS,
      )
      const outstanding = this.sql
        .exec<CountRow>(
          `SELECT COUNT(*) AS count FROM socket_tickets
           WHERE uid = ? AND game_id = ? AND expires_at > ? AND used_at IS NULL`,
          ticket.uid,
          ticket.gameId,
          now,
        )
        .one().count
      if (outstanding >= SOCKET_TICKET_MAX_OUTSTANDING) {
        return "outstanding-limit" as const
      }
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
      return "issued" as const
    })
    return Promise.resolve(result)
  }

  consume(ticketHash: string, now: number) {
    const consumed = this.storage.transactionSync(() => {
      this.cleanupIfDue(now)
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
        if (record) {
          this.sql.exec(
            `DELETE FROM socket_tickets WHERE ticket_hash = ?`,
            ticketHash,
          )
        }
        return null
      }
      this.sql.exec(
        `DELETE FROM socket_tickets
         WHERE ticket_hash = ? AND used_at IS NULL AND expires_at > ?`,
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

  cleanup(now: number) {
    const removed = this.storage.transactionSync(() => this.runCleanup(now))
    return Promise.resolve(removed)
  }

  private cleanupIfDue(now: number) {
    if (now < this.nextCleanupAt) return
    this.runCleanup(now)
  }

  private runCleanup(now: number) {
    const expired = this.sql
      .exec<StoredTicketRow>(
        `SELECT ticket_hash AS ticketHash FROM socket_tickets
         WHERE expires_at < ? OR used_at IS NOT NULL`,
        now,
      )
      .toArray().length
    this.sql.exec(
      `DELETE FROM socket_tickets WHERE expires_at < ? OR used_at IS NOT NULL`,
      now,
    )
    this.sql.exec(
      `DELETE FROM socket_ticket_issue_limits WHERE window_started_at < ?`,
      now - SOCKET_TICKET_RATE_WINDOW_MS,
    )
    this.nextCleanupAt = now + CLEANUP_INTERVAL_MS
    return expired
  }
}

export class MemorySocketTicketRepository implements SocketTicketRepository {
  private readonly tickets = new Map<string, StoredTicket>()
  private readonly issueLimits = new Map<string, RateLimitRow>()
  private nextCleanupAt = 0

  issue(ticket: StoredTicket, now: number) {
    this.cleanupIfDue(now)
    const key = `${ticket.uid}\0${ticket.gameId}`
    const rate = this.issueLimits.get(key)
    if (rate && now - rate.windowStartedAt < SOCKET_TICKET_RATE_WINDOW_MS) {
      if (rate.attempts >= SOCKET_TICKET_ISSUE_LIMIT) {
        return Promise.resolve("rate-limit" as const)
      }
      rate.attempts += 1
    } else {
      this.issueLimits.set(key, { windowStartedAt: now, attempts: 1 })
    }
    const outstanding = [...this.tickets.values()].filter(
      candidate =>
        candidate.uid === ticket.uid &&
        candidate.gameId === ticket.gameId &&
        candidate.expiresAt > now &&
        candidate.usedAt === null,
    ).length
    if (outstanding >= SOCKET_TICKET_MAX_OUTSTANDING) {
      return Promise.resolve("outstanding-limit" as const)
    }
    this.tickets.set(ticket.ticketHash, structuredClone(ticket))
    return Promise.resolve("issued" as const)
  }

  consume(ticketHash: string, now: number) {
    this.cleanupIfDue(now)
    const ticket = this.tickets.get(ticketHash)
    if (ticket === undefined) return Promise.resolve(null)
    this.tickets.delete(ticketHash)
    if (ticket.usedAt !== null || ticket.expiresAt <= now) {
      return Promise.resolve(null)
    }
    return Promise.resolve(structuredClone({ ...ticket, usedAt: now }))
  }

  cleanup(now: number) {
    let removed = 0
    for (const [hash, ticket] of this.tickets) {
      if (ticket.expiresAt < now || ticket.usedAt !== null) {
        this.tickets.delete(hash)
        removed += 1
      }
    }
    for (const [key, rate] of this.issueLimits) {
      if (rate.windowStartedAt < now - SOCKET_TICKET_RATE_WINDOW_MS) {
        this.issueLimits.delete(key)
      }
    }
    this.nextCleanupAt = now + CLEANUP_INTERVAL_MS
    return Promise.resolve(removed)
  }

  has(ticketHash: string) {
    return this.tickets.has(ticketHash)
  }

  get size() {
    return this.tickets.size
  }

  private cleanupIfDue(now: number) {
    if (now < this.nextCleanupAt) return
    void this.cleanup(now)
  }
}

export class SocketTicketIssueError extends Error {
  constructor(readonly reason: Exclude<TicketIssueResult, "issued">) {
    super(reason)
  }
}

export class SocketTicketService {
  constructor(
    private readonly repository: SocketTicketRepository,
    private readonly now: () => number = Date.now,
  ) {}

  async issue(session: GameSession, ttlMilliseconds = SOCKET_TICKET_TTL_MS) {
    const raw = crypto.getRandomValues(new Uint8Array(32))
    const ticket = encodeBase64Url(raw)
    const now = this.now()
    const expiresAt = now + ttlMilliseconds
    const result = await this.repository.issue(
      {
        ...session,
        ticketHash: await hashSocketTicket(ticket),
        expiresAt,
        usedAt: null,
      },
      now,
    )
    if (result !== "issued") throw new SocketTicketIssueError(result)
    return { ticket, expiresAt: new Date(expiresAt).toISOString() }
  }

  async consume(ticket: string) {
    if (ticket.length < 32 || ticket.length > 128) return null
    return this.repository.consume(await hashSocketTicket(ticket), this.now())
  }
}
