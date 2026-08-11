import { DatabaseSync } from "node:sqlite"
import { LobbyDurableObject } from "../src/lobby-durable-object"
import type {
  ActivateLobbyResult,
  AddParticipantResult,
  CreateLobbyResult,
  LobbyDeckRecord,
  LobbyRecord,
  LobbyStore,
  ParticipantRecord,
} from "../src/lobby-storage"
import {
  FINISHED_LOBBY_RETENTION_MS,
  LOBBY_CREATE_BURST_LIMIT,
  LOBBY_CREATE_BURST_WINDOW_MS,
  LOBBY_CREATE_WINDOW_LIMIT,
  LOBBY_CREATE_WINDOW_MS,
  MAX_ACTIVE_LOBBIES_PER_UID,
  MAX_WAITING_LOBBIES_PER_UID,
  SqliteLobbyStore,
  STARTING_LOBBY_TIMEOUT_MS,
  WAITING_LOBBY_TTL_MS,
  type CreateLobbyStage,
} from "../src/lobby-storage"
import { MemorySocketTicketRepository } from "../src/tickets"
import type {
  DurableObjectState,
  Env,
  DurableObjectStorage,
  SqlStorage,
  SqlStorageCursor,
  SqlStorageValue,
  VerifiedIdentity,
} from "../src/types"

class NodeSqlStorage implements SqlStorage {
  constructor(private readonly database: DatabaseSync) {}

  exec<T extends object = Record<string, unknown>>(
    query: string,
    ...bindings: SqlStorageValue[]
  ): SqlStorageCursor<T> {
    if (bindings.length === 0 && query.trim().includes(";")) {
      this.database.exec(query)
      return { toArray: () => [], one: () => undefined as never }
    }
    const values = bindings.map(binding =>
      binding instanceof ArrayBuffer ? new Uint8Array(binding) : binding,
    )
    const rows = this.database.prepare(query).all(...values) as T[]
    return {
      toArray: () => rows,
      one: () => {
        if (rows.length !== 1) throw new Error("Expected exactly one SQL row.")
        return rows[0]!
      },
    }
  }
}

const sqliteStorage = (database: DatabaseSync): DurableObjectStorage => ({
  sql: new NodeSqlStorage(database),
  transactionSync: callback => {
    database.exec("BEGIN")
    try {
      const result = callback()
      database.exec("COMMIT")
      return result
    } catch (caught) {
      database.exec("ROLLBACK")
      throw caught
    }
  },
  getAlarm: () => Promise.resolve(null),
  setAlarm: () => Promise.resolve(),
})

class MemoryLobbyStore implements LobbyStore {
  private readonly lobbies = new Map<string, LobbyRecord>()
  private readonly participants = new Map<string, ParticipantRecord>()
  private readonly decks = new Map<string, LobbyDeckRecord>()
  private readonly creationLimits = new Map<
    string,
    {
      burstStartedAt: number
      burstAttempts: number
      windowStartedAt: number
      windowAttempts: number
    }
  >()

  listVisible(waitingCreatedAfter: string, viewerUid?: string) {
    return [...this.lobbies.values()]
      .filter(
        lobby =>
          (lobby.visibility === "public" &&
            lobby.status === "waiting" &&
            lobby.createdAt > waitingCreatedAfter) ||
          (viewerUid !== undefined &&
            (lobby.status === "starting" ||
              lobby.status === "active" ||
              (lobby.status === "waiting" &&
                lobby.createdAt > waitingCreatedAfter)) &&
            this.getParticipant(lobby.id, viewerUid) !== null),
      )
      .map(lobby => this.withCount(lobby))
  }

  getByCode(code: string) {
    const lobby = [...this.lobbies.values()].find(
      candidate => candidate.code === code,
    )
    return lobby ? this.withCount(lobby) : null
  }

  getById(gameId: string) {
    const lobby = this.lobbies.get(gameId)
    return lobby ? this.withCount(lobby) : null
  }

  createLobbyWithHost(
    lobby: LobbyRecord,
    participant: ParticipantRecord,
    attemptedAt: number,
  ): CreateLobbyResult {
    const rate = this.creationLimits.get(lobby.hostUid)
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
    this.creationLimits.set(lobby.hostUid, {
      burstStartedAt: burstAttempts === 0 ? attemptedAt : rate!.burstStartedAt,
      burstAttempts: burstAttempts + 1,
      windowStartedAt:
        windowAttempts === 0 ? attemptedAt : rate!.windowStartedAt,
      windowAttempts: windowAttempts + 1,
    })
    const waiting = [...this.lobbies.values()].filter(
      candidate =>
        candidate.hostUid === lobby.hostUid &&
        candidate.status === "waiting" &&
        Date.parse(candidate.createdAt) > attemptedAt - WAITING_LOBBY_TTL_MS,
    ).length
    if (waiting >= MAX_WAITING_LOBBIES_PER_UID) {
      return { status: "waiting-quota" }
    }
    this.lobbies.set(lobby.id, structuredClone(lobby))
    this.participants.set(
      this.participantKey(participant.gameId, participant.uid),
      structuredClone(participant),
    )
    return { status: "inserted" }
  }

  getParticipant(gameId: string, uid: string) {
    return (
      structuredClone(
        this.participants.get(this.participantKey(gameId, uid)),
      ) ?? null
    )
  }

  listPlayers(gameId: string) {
    return this.listParticipants(gameId).filter(
      participant => participant.role === "player",
    )
  }

  listParticipants(gameId: string) {
    return [...this.participants.values()]
      .filter(participant => participant.gameId === gameId)
      .sort(
        (left, right) =>
          (left.seatNumber ?? Number.MAX_SAFE_INTEGER) -
          (right.seatNumber ?? Number.MAX_SAFE_INTEGER),
      )
      .map(participant => structuredClone(participant))
  }

  getDeck(gameId: string, uid: string) {
    return (
      structuredClone(this.decks.get(this.participantKey(gameId, uid))) ?? null
    )
  }

  listDecks(gameId: string) {
    return [...this.decks.values()]
      .filter(deck => deck.gameId === gameId)
      .map(deck => structuredClone(deck))
  }

  upsertDeck(record: LobbyDeckRecord) {
    this.decks.set(
      this.participantKey(record.gameId, record.uid),
      structuredClone(record),
    )
  }

  addParticipant(
    gameId: string,
    participant: ParticipantRecord,
  ): AddParticipantResult {
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
    this.participants.set(
      this.participantKey(gameId, participant.uid),
      structuredClone(participant),
    )
    return { status: "inserted", participant }
  }

  setStatus(gameId: string, status: LobbyRecord["status"], updatedAt: string) {
    const lobby = this.lobbies.get(gameId)
    if (!lobby) return false
    this.lobbies.set(gameId, { ...lobby, status, updatedAt })
    return true
  }

  activateLobby(
    gameId: string,
    hostUid: string,
    updatedAt: string,
  ): ActivateLobbyResult {
    const lobby = this.lobbies.get(gameId)
    if (lobby?.hostUid !== hostUid) return "missing"
    const active = [...this.lobbies.values()].filter(
      candidate =>
        candidate.id !== gameId &&
        candidate.hostUid === hostUid &&
        (candidate.status === "starting" || candidate.status === "active"),
    ).length
    if (active >= MAX_ACTIVE_LOBBIES_PER_UID) return "quota"
    this.lobbies.set(gameId, { ...lobby, status: "active", updatedAt })
    return "updated"
  }

  reserveLobbyStart(
    gameId: string,
    hostUid: string,
    updatedAt: string,
  ): ActivateLobbyResult {
    const lobby = this.lobbies.get(gameId)
    if (lobby?.hostUid !== hostUid || lobby.status !== "waiting") {
      return "missing"
    }
    const active = [...this.lobbies.values()].filter(
      candidate =>
        candidate.hostUid === hostUid &&
        (candidate.status === "starting" || candidate.status === "active"),
    ).length
    if (active >= MAX_ACTIVE_LOBBIES_PER_UID) return "quota"
    this.lobbies.set(gameId, { ...lobby, status: "starting", updatedAt })
    return "updated"
  }

  deleteLobby(gameId: string) {
    if (!this.lobbies.delete(gameId)) return false
    for (const [key, participant] of this.participants) {
      if (participant.gameId === gameId) this.participants.delete(key)
    }
    for (const [key, deck] of this.decks) {
      if (deck.gameId === gameId) this.decks.delete(key)
    }
    return true
  }

  cleanupExpired(
    startingUpdatedBefore: string,
    waitingCreatedBefore: string,
    finishedUpdatedBefore: string,
  ) {
    let startingRecovered = 0
    let waiting = 0
    let finished = 0
    for (const [gameId, lobby] of this.lobbies) {
      if (
        lobby.status === "starting" &&
        lobby.updatedAt <= startingUpdatedBefore
      ) {
        this.lobbies.set(gameId, {
          ...lobby,
          status: "waiting",
          updatedAt: startingUpdatedBefore,
        })
        startingRecovered += 1
      }
    }
    for (const lobby of [...this.lobbies.values()]) {
      if (
        lobby.status === "waiting" &&
        lobby.createdAt <= waitingCreatedBefore
      ) {
        waiting += Number(this.deleteLobby(lobby.id))
      } else if (
        lobby.status === "finished" &&
        lobby.updatedAt <= finishedUpdatedBefore
      ) {
        finished += Number(this.deleteLobby(lobby.id))
      }
    }
    let rateLimitsDeleted = 0
    const rateLimitCutoff = Date.parse(finishedUpdatedBefore)
    for (const [uid, rate] of this.creationLimits) {
      if (rate.windowStartedAt < rateLimitCutoff) {
        this.creationLimits.delete(uid)
        rateLimitsDeleted += 1
      }
    }
    return { startingRecovered, waiting, finished, rateLimitsDeleted }
  }

  nextExpirationAt() {
    const expirations = [...this.lobbies.values()].flatMap(lobby => {
      if (lobby.status === "waiting") {
        return [Date.parse(lobby.createdAt) + WAITING_LOBBY_TTL_MS]
      }
      if (lobby.status === "finished") {
        return [Date.parse(lobby.updatedAt) + FINISHED_LOBBY_RETENTION_MS]
      }
      if (lobby.status === "starting") {
        return [Date.parse(lobby.updatedAt) + STARTING_LOBBY_TIMEOUT_MS]
      }
      return []
    })
    return expirations.length
      ? new Date(Math.min(...expirations)).toISOString()
      : null
  }

  get rateLimitCount() {
    return this.creationLimits.size
  }

  private withCount(lobby: LobbyRecord): LobbyRecord {
    return {
      ...structuredClone(lobby),
      playerCount: this.listPlayers(lobby.id).length,
    }
  }

  private participantKey(gameId: string, uid: string) {
    return `${gameId}:${uid}`
  }
}

const identity = (uid: string): VerifiedIdentity => ({
  uid,
  name: `User ${uid}`,
  anonymous: true,
})

const lobbyInput = (title: string) => ({
  title,
  format: "Commander",
  visibility: "public" as const,
  maxPlayers: 4,
})

const state: DurableObjectState = {
  storage: {
    sql: {
      exec: <T extends object = Record<string, unknown>>() =>
        ({
          toArray: () => [],
          one: () => {
            throw new Error("No SQL rows expected with injected stores.")
          },
        }) as SqlStorageCursor<T>,
    },
    transactionSync: callback => callback(),
    getAlarm: () => Promise.resolve(null),
    setAlarm: () => Promise.resolve(),
  },
  blockConcurrencyWhile: callback => callback(),
  waitUntil: () => undefined,
  acceptWebSocket: () => undefined,
  getWebSockets: () => [],
}

describe("Lobby Durable Object RPC", () => {
  test("bewaart stabiele sources en onveranderlijke revisions per sourceHash", async () => {
    const database = new DatabaseSync(":memory:")
    const storage = sqliteStorage(database)
    const durableState: DurableObjectState = {
      ...state,
      storage,
    }
    const lobby = new LobbyDurableObject(durableState, {} as Env)
    const versionA = {
      source: "archidekt" as const,
      sourceId: "24765444",
      sourceUrl: "https://archidekt.com/decks/24765444/primal_stampede",
      sourceHash: "HASH-A",
      name: "Primal Stampede",
      importedAt: "2026-08-11T10:00:00.000Z",
      cards: [{ definitionId: "card-a", quantity: 100, isCommander: false }],
      definitions: [],
    }
    const first = await lobby.resolveDeckRevision(versionA)
    expect(first.deckId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect((await lobby.resolveDeckRevision(versionA)).revisionId).toBe(
      first.revisionId,
    )
    const second = await lobby.resolveDeckRevision({
      ...versionA,
      sourceHash: "HASH-B",
      importedAt: "2026-08-11T11:00:00.000Z",
      cards: [{ definitionId: "card-b", quantity: 101, isCommander: false }],
    })
    expect(second.deckId).toBe(first.deckId)
    expect(second.revisionId).not.toBe(first.revisionId)
    const afterCacheEviction = new LobbyDurableObject(durableState, {} as Env)
    expect(await afterCacheEviction.resolveDeckRevision(versionA)).toEqual(
      first,
    )
    expect(
      (await lobby.resolveDeckRevision({ ...versionA, sourceId: "other" }))
        .deckId,
    ).not.toBe(first.deckId)
    expect(
      (
        await lobby.resolveDeckRevision({
          ...versionA,
          source: "moxfield",
        })
      ).deckId,
    ).not.toBe(first.deckId)
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM deck_source_identities")
        .get(),
    ).toEqual({ count: 3 })
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM deck_revisions").get(),
    ).toEqual({ count: 4 })
    const persistedRevision = JSON.parse(
      String(
        database
          .prepare("SELECT deck_json FROM deck_revisions WHERE revision_id = ?")
          .get(first.revisionId)?.deck_json,
      ),
    ) as { cards: unknown }
    expect(persistedRevision.cards).toEqual(versionA.cards)
    database.close()
  })

  test("maakt lobby's en registreert rate limits op het pre-H-01 productieschema", () => {
    const database = new DatabaseSync(":memory:")
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE lobbies (
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
      CREATE TABLE lobby_participants (
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
      CREATE TABLE lobby_decks (
        game_id TEXT NOT NULL,
        uid TEXT NOT NULL,
        deck_json TEXT NOT NULL,
        registered_at TEXT NOT NULL,
        PRIMARY KEY (game_id, uid),
        FOREIGN KEY (game_id, uid)
          REFERENCES lobby_participants(game_id, uid) ON DELETE CASCADE
      );
    `)
    const storage = sqliteStorage(database)
    const store = new SqliteLobbyStore(storage)
    const attemptedAt = Date.parse("2026-08-10T10:00:00.000Z")
    const stages: CreateLobbyStage[] = []

    for (let index = 0; index < LOBBY_CREATE_BURST_LIMIT; index += 1) {
      const id = `game-${index}`
      const createdAt = new Date(attemptedAt).toISOString()
      expect(
        store.createLobbyWithHost(
          {
            id,
            code: `CODE0${index}`,
            title: `Lobby ${index}`,
            hostUid: "production-owner",
            hostDisplayName: "Owner",
            format: "Commander",
            visibility: "public",
            status: "waiting",
            playerCount: 1,
            maxPlayers: 4,
            createdAt,
            updatedAt: createdAt,
          },
          {
            gameId: id,
            uid: "production-owner",
            playerId: `player-${index}`,
            role: "player",
            displayName: "Owner",
            seatNumber: 0,
            joinedAt: createdAt,
          },
          attemptedAt,
          index === 0 ? stage => stages.push(stage) : undefined,
        ),
      ).toEqual({ status: "inserted" })
    }

    expect(stages).toEqual([
      "create_lobby_rate_limit",
      "create_lobby_quota",
      "create_lobby_insert",
      "create_lobby_host_insert",
      "create_lobby_transaction_complete",
    ])

    const rateRow = database
      .prepare(
        `SELECT burst_attempts AS burstAttempts,
                window_attempts AS windowAttempts
         FROM lobby_creation_limits WHERE uid = ?`,
      )
      .get("production-owner") as {
      burstAttempts: number
      windowAttempts: number
    }
    expect(rateRow).toEqual({ burstAttempts: 3, windowAttempts: 3 })
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM lobbies").get(),
    ).toEqual({ count: 3 })

    database.close()
  })

  test("handhaaft wachtende-lobbyquota per geverifieerde UID", () => {
    let now = Date.parse("2026-08-10T10:00:00.000Z")
    const store = new MemoryLobbyStore()
    const lobby = new LobbyDurableObject(
      state,
      {} as Env,
      store,
      new MemorySocketTicketRepository(),
      () => now,
    )
    const owner = identity("quota-owner")
    for (let index = 0; index < MAX_WAITING_LOBBIES_PER_UID; index += 1) {
      expect(lobby.createLobby(lobbyInput(`Lobby ${index}`), owner).ok).toBe(
        true,
      )
      now += LOBBY_CREATE_BURST_WINDOW_MS
    }

    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined)
    expect(lobby.createLobby(lobbyInput("Te veel"), owner)).toMatchObject({
      ok: false,
      status: 409,
      code: "LOBBY_QUOTA_EXCEEDED",
    })
    expect(warning).toHaveBeenCalledWith(
      "Lobby quota exceeded.",
      expect.objectContaining({
        event: "lobby_quota_exceeded",
        uid: owner.uid,
      }),
    )
    now += LOBBY_CREATE_BURST_WINDOW_MS
    expect(
      lobby.createLobby(lobbyInput("Nog steeds te veel"), owner),
    ).toMatchObject({ ok: false, code: "LOBBY_QUOTA_EXCEEDED" })
    now += LOBBY_CREATE_BURST_WINDOW_MS
    expect(lobby.createLobby(lobbyInput("Rate na quota"), owner)).toMatchObject(
      {
        ok: false,
        code: "LOBBY_CREATE_RATE_LIMITED",
      },
    )
    expect(
      lobby.createLobby(lobbyInput("Andere eigenaar"), identity("other-user"))
        .ok,
    ).toBe(true)
    warning.mockRestore()
  })

  test("rate-limit blokkeert een vierde snelle creatie maar normaal herstel werkt", () => {
    let now = Date.parse("2026-08-10T10:00:00.000Z")
    const store = new MemoryLobbyStore()
    const lobby = new LobbyDurableObject(
      state,
      {} as Env,
      store,
      new MemorySocketTicketRepository(),
      () => now,
    )
    const owner = identity("rate-owner")
    const createdIds: string[] = []
    for (let index = 0; index < LOBBY_CREATE_BURST_LIMIT; index += 1) {
      const created = lobby.createLobby(lobbyInput(`Burst ${index}`), owner)
      expect(created.ok).toBe(true)
      if (created.ok) createdIds.push(created.value.id)
    }
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined)
    expect(lobby.createLobby(lobbyInput("Burst reject"), owner)).toMatchObject({
      ok: false,
      status: 429,
      code: "LOBBY_CREATE_RATE_LIMITED",
    })
    expect(warning).toHaveBeenCalledWith(
      "Lobby creation rate limit exceeded.",
      expect.objectContaining({ uid: owner.uid }),
    )

    expect(lobby.deleteLobby(createdIds[0]!, owner).ok).toBe(true)
    now += LOBBY_CREATE_BURST_WINDOW_MS
    const fourth = lobby.createLobby(lobbyInput("Legitiem vervolg"), owner)
    expect(fourth.ok).toBe(true)
    if (!fourth.ok) return
    expect(lobby.deleteLobby(fourth.value.id, owner).ok).toBe(true)
    now += LOBBY_CREATE_BURST_WINDOW_MS
    const fifth = lobby.createLobby(lobbyInput("Vijfde poging"), owner)
    expect(fifth.ok).toBe(true)
    if (!fifth.ok) return
    expect(lobby.deleteLobby(fifth.value.id, owner).ok).toBe(true)
    now += LOBBY_CREATE_BURST_WINDOW_MS
    expect(lobby.createLobby(lobbyInput("Zesde poging"), owner)).toMatchObject({
      ok: false,
      status: 429,
      code: "LOBBY_CREATE_RATE_LIMITED",
    })
    warning.mockRestore()
  })

  test("handhaaft afzonderlijk drie startbare of actieve lobby's", () => {
    let now = Date.parse("2026-08-10T10:00:00.000Z")
    const store = new MemoryLobbyStore()
    const lobby = new LobbyDurableObject(
      state,
      {} as Env,
      store,
      new MemorySocketTicketRepository(),
      () => now,
    )
    const owner = identity("active-owner")
    for (let index = 0; index < MAX_ACTIVE_LOBBIES_PER_UID; index += 1) {
      const created = lobby.createLobby(lobbyInput(`Actief ${index}`), owner)
      expect(created.ok).toBe(true)
      if (!created.ok) return
      expect(lobby.markGameActive(created.value.id, owner).ok).toBe(true)
      now += LOBBY_CREATE_WINDOW_MS
    }
    const fourth = lobby.createLobby(lobbyInput("Vierde actief"), owner)
    expect(fourth.ok).toBe(true)
    if (!fourth.ok) return

    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined)
    expect(lobby.markGameActive(fourth.value.id, owner)).toMatchObject({
      ok: false,
      code: "LOBBY_QUOTA_EXCEEDED",
    })
    expect(warning).toHaveBeenCalledWith(
      "Lobby quota exceeded.",
      expect.objectContaining({ group: "active", uid: owner.uid }),
    )
    warning.mockRestore()
  })

  test("verwijdert verlopen wachtende en oude finished lobby's idempotent", () => {
    let now = Date.parse("2026-08-10T10:00:00.000Z")
    const store = new MemoryLobbyStore()
    const alarms: number[] = []
    const alarmState: DurableObjectState = {
      ...state,
      storage: {
        ...state.storage,
        setAlarm: scheduledTime => {
          alarms.push(
            scheduledTime instanceof Date
              ? scheduledTime.getTime()
              : scheduledTime,
          )
          return Promise.resolve()
        },
      },
    }
    const lobby = new LobbyDurableObject(
      alarmState,
      {} as Env,
      store,
      new MemorySocketTicketRepository(),
      () => now,
    )
    const waitingOwner = identity("waiting-owner")
    const finishedOwner = identity("finished-owner")
    const waiting = lobby.createLobby(lobbyInput("Verloopt"), waitingOwner)
    const finished = lobby.createLobby(lobbyInput("Finished"), finishedOwner)
    expect(waiting.ok && finished.ok).toBe(true)
    if (!waiting.ok || !finished.ok) return
    expect(alarms).toContain(now + WAITING_LOBBY_TTL_MS)

    store.setStatus(finished.value.id, "active", new Date(now).toISOString())
    expect(lobby.markGameFinished(finished.value.id, finishedOwner).ok).toBe(
      true,
    )
    now += WAITING_LOBBY_TTL_MS
    expect(lobby.listPublicLobbies().map(item => item.id)).not.toContain(
      waiting.value.id,
    )

    const info = vi.spyOn(console, "info").mockImplementation(() => undefined)
    lobby.alarm()
    expect(store.getById(waiting.value.id)).toBeNull()
    expect(store.getById(finished.value.id)).not.toBeNull()

    now += FINISHED_LOBBY_RETENTION_MS - WAITING_LOBBY_TTL_MS + 1
    lobby.alarm()
    expect(store.getById(finished.value.id)).toBeNull()
    expect(store.rateLimitCount).toBe(0)
    expect(info).toHaveBeenCalledWith(
      "Automatic lobby cleanup completed.",
      expect.objectContaining({ rateLimitsDeleted: 2 }),
    )
    lobby.alarm()
    expect(info).toHaveBeenLastCalledWith(
      "Automatic lobby cleanup completed.",
      expect.objectContaining({ totalDeleted: 0 }),
    )
    info.mockRestore()
  })

  test("herstelt een stale starting-reservering veilig naar waiting", () => {
    let now = Date.parse("2026-08-10T10:00:00.000Z")
    const store = new MemoryLobbyStore()
    const lobby = new LobbyDurableObject(
      state,
      {} as Env,
      store,
      new MemorySocketTicketRepository(),
      () => now,
    )
    const owner = identity("stale-start-owner")
    const created = lobby.createLobby(lobbyInput("Start recovery"), owner)
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(
      store.reserveLobbyStart(
        created.value.id,
        owner.uid,
        new Date(now).toISOString(),
      ),
    ).toBe("updated")
    expect(Date.parse(store.nextExpirationAt()!)).toBe(
      now + STARTING_LOBBY_TIMEOUT_MS,
    )

    now += STARTING_LOBBY_TIMEOUT_MS
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined)
    lobby.alarm()
    expect(store.getById(created.value.id)?.status).toBe("waiting")
    expect(info).toHaveBeenCalledWith(
      "Automatic lobby cleanup completed.",
      expect.objectContaining({ startingRecovered: 1 }),
    )
    info.mockRestore()
  })

  test("beheert vier seats, spectator, host en tickets zonder externe database", async () => {
    const store = new MemoryLobbyStore()
    const tickets = new MemorySocketTicketRepository()
    const lobby = new LobbyDurableObject(state, {} as Env, store, tickets)
    const host = identity("host")
    const created = lobby.createLobby(
      {
        title: "Commanderavond",
        format: "Commander",
        visibility: "public",
        maxPlayers: 4,
      },
      host,
    )
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const gameId = created.value.id
    const code = created.value.code
    expect(lobby.listPublicLobbies()).toEqual([
      expect.objectContaining({
        id: gameId,
        playerCount: 1,
        viewerRole: null,
      }),
    ])
    expect(lobby.listPublicLobbies(host.uid)[0]?.viewerRole).toBe("host")

    for (const uid of ["two", "three", "four"]) {
      const joined = lobby.joinByCode(code, "player", identity(uid))
      expect(joined).toMatchObject({
        ok: true,
        value: { gameId, role: "player" },
      })
    }
    const spectator = lobby.joinByCode(code, "spectator", identity("viewer"))
    expect(spectator).toMatchObject({
      ok: true,
      value: { role: "spectator", lobby: { playerCount: 4 } },
    })
    expect(
      lobby.joinByCode(code, "player", identity("too-many")),
    ).toMatchObject({ ok: false, code: "LOBBY_FULL" })
    const room = lobby.getLobbyRoom(gameId, identity("two"))
    expect(room).toMatchObject({
      ok: true,
      value: { lobby: { viewerRole: "player" } },
    })
    if (!room.ok) return
    expect(room.value.participants).toHaveLength(5)
    expect(room.value.participants[0]).toMatchObject({
      displayName: "User host",
      isHost: true,
      isViewer: false,
    })
    expect(room.value.participants[1]).toMatchObject({
      displayName: "User two",
      isHost: false,
      isViewer: true,
    })

    const hostSession = lobby.getSession(gameId, host.uid)
    const viewerSession = lobby.getSession(gameId, "viewer")
    expect(hostSession).toMatchObject({
      role: "player",
      isHost: true,
    })
    expect(typeof hostSession?.playerId).toBe("string")
    expect(viewerSession).toEqual({
      gameId,
      uid: "viewer",
      playerId: null,
      role: "spectator",
      isHost: false,
    })

    const issued = await lobby.issueSocketTicket(gameId, identity("two"))
    expect(issued.ok).toBe(true)
    if (!issued.ok) return
    const consumed = await lobby.consumeSocketTicket(issued.value.ticket)
    expect(consumed).toMatchObject({
      gameId,
      uid: "two",
      role: "player",
      isHost: false,
    })
    expect(await lobby.consumeSocketTicket(issued.value.ticket)).toBeNull()
  })

  test("laat alleen de host een wachtende lobby verwijderen", () => {
    const store = new MemoryLobbyStore()
    const lobby = new LobbyDurableObject(
      state,
      {} as Env,
      store,
      new MemorySocketTicketRepository(),
    )
    const host = identity("host")
    const created = lobby.createLobby(
      {
        title: "Tijdelijke tafel",
        format: "Commander",
        visibility: "public",
        maxPlayers: 4,
      },
      host,
    )
    if (!created.ok) throw new Error("Lobby creation failed.")
    lobby.joinByCode(created.value.code, "player", identity("guest"))

    expect(
      lobby.deleteLobby(created.value.id, identity("guest")),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" })
    expect(lobby.deleteLobby(created.value.id, host)).toEqual({
      ok: true,
      value: null,
    })
    expect(lobby.listPublicLobbies()).toEqual([])
    expect(lobby.getSession(created.value.id, host.uid)).toBeNull()
  })

  test("bindt geregistreerde decks aan serverseats en archiveert de open lobby", () => {
    const store = new MemoryLobbyStore()
    const lobby = new LobbyDurableObject(
      state,
      {} as Env,
      store,
      new MemorySocketTicketRepository(),
    )
    const host = identity("host")
    const created = lobby.createLobby(
      {
        title: "Duel",
        format: "Commander",
        visibility: "public",
        maxPlayers: 2,
      },
      host,
    )
    if (!created.ok) throw new Error("Lobby creation failed.")
    lobby.joinByCode(created.value.code, "player", identity("guest"))
    const players = store.listPlayers(created.value.id)
    const submission = (uid: string) => ({
      deckSnapshotId: `deck-${uid}`,
      deckName: `Deck van ${uid}`,
      cards: [
        {
          definitionId: `card-${uid}`,
          name: "Testkaart",
          quantity: 10,
          isCommander: false,
        },
      ],
      tokens: [],
    })
    expect(lobby.prepareRegisteredGame(created.value.id, host)).toMatchObject({
      ok: false,
      code: "LOBBY_NOT_READY",
    })
    for (const player of players) {
      expect(
        lobby.registerDeck(
          created.value.id,
          identity(player.uid),
          submission(player.uid),
        ),
      ).toEqual({ ok: true, value: null })
    }
    const room = lobby.getLobbyRoom(created.value.id, host)
    expect(room).toMatchObject({
      ok: true,
      value: {
        participants: [
          {
            deckReady: true,
            deckName: "Deck van host",
          },
          {
            deckReady: true,
            deckName: "Deck van guest",
          },
        ],
      },
    })

    const prepared = lobby.prepareRegisteredGame(created.value.id, host)
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    expect(prepared.value.seed.players).toEqual([
      expect.objectContaining({
        uid: "host",
        displayName: "User host",
        deckSnapshotId: "deck-host",
        cards: [
          {
            definitionId: "card-host",
            name: "Testkaart",
            quantity: 10,
            isCommander: false,
          },
        ],
      }),
      expect.objectContaining({
        uid: "guest",
        displayName: "User guest",
        deckSnapshotId: "deck-guest",
      }),
    ])
    expect(
      lobby.prepareRegisteredGame(created.value.id, identity("guest")),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" })

    expect(lobby.markGameActive(created.value.id, host)).toEqual({
      ok: true,
      value: null,
    })
    expect(lobby.listPublicLobbies()).toEqual([])
    expect(lobby.listPublicLobbies(host.uid)).toEqual([
      expect.objectContaining({
        id: created.value.id,
        status: "active",
        viewerRole: "host",
      }),
    ])
    expect(lobby.listPublicLobbies("guest")).toEqual([
      expect.objectContaining({
        id: created.value.id,
        status: "active",
        viewerRole: "player",
      }),
    ])
  })
})
