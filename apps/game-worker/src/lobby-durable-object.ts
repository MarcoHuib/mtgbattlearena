import { DurableObject } from "cloudflare:workers"
import {
  onlineDeckSubmissionSchema,
  type OnlineDeckSubmission,
} from "@mtg/game-protocol"
import {
  onlineGameSeedSchema,
  type OnlineGameSeed,
} from "./game-server-adapter"
import {
  FINISHED_LOBBY_RETENTION_MS,
  MAX_ACTIVE_LOBBIES_PER_UID,
  MAX_WAITING_LOBBIES_PER_UID,
  SqliteLobbyStore,
  STARTING_LOBBY_TIMEOUT_MS,
  WAITING_LOBBY_TTL_MS,
  type CreateLobbyStage,
  type LobbyRecord,
  type LobbyStore,
  type ParticipantRecord,
} from "./lobby-storage"
import {
  SocketTicketService,
  SocketTicketIssueError,
  SqliteSocketTicketRepository,
  type SocketTicketRepository,
} from "./tickets"
import type {
  ConnectionRole,
  CreateLobbyInput,
  DurableObjectStorage,
  DurableObjectState,
  Env,
  GameSession,
  JoinLobbyResult,
  LobbyRoom,
  LobbySummary,
  RpcResult,
  VerifiedIdentity,
} from "./types"

const displayNameFor = (identity: VerifiedIdentity) => {
  const name = identity.name?.trim()
  return name?.length ? name : "Planeswalker"
}

const joinCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const randomByteAcceptanceLimit = joinCodeAlphabet.length * 7

type FillRandomValues = (bytes: Uint8Array) => Uint8Array

export const randomCode = (
  length: number,
  fillRandomValues: FillRandomValues = bytes => crypto.getRandomValues(bytes),
) => {
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new RangeError("De lengte van een joincode moet positief zijn.")
  }

  let code = ""
  const bytes = new Uint8Array(Math.max(16, length * 2))

  while (code.length < length) {
    fillRandomValues(bytes)
    for (const byte of bytes) {
      // Rejection sampling houdt iedere tekenindex exact even waarschijnlijk.
      if (byte >= randomByteAcceptanceLimit) continue
      code += joinCodeAlphabet[byte % joinCodeAlphabet.length]
      if (code.length === length) break
    }
  }

  return code
}

const failure = (
  status: number,
  code: string,
  message: string,
): RpcResult<never> => ({ ok: false, status, code, message })

type CreateLobbyDiagnosticStage =
  | "create_lobby_begin"
  | CreateLobbyStage
  | "create_lobby_alarm_schedule"
  | "create_lobby_complete"

const sanitizeDiagnosticText = (value: string) =>
  value
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(
      /(?:authorization|ticket|join[_ -]?code)\s*[:=]\s*[^\s,}]+/gi,
      "credential=[redacted]",
    )
    .slice(0, 4_000)

const errorDiagnostics = (caught: unknown) => {
  if (!(caught instanceof Error)) {
    return {
      errorName: "NonError",
      errorMessage: sanitizeDiagnosticText(String(caught)),
    }
  }
  const cause = caught.cause
  return {
    errorName: caught.name,
    errorMessage: sanitizeDiagnosticText(caught.message),
    stack: caught.stack ? sanitizeDiagnosticText(caught.stack) : undefined,
    cause:
      cause instanceof Error
        ? {
            name: cause.name,
            message: sanitizeDiagnosticText(cause.message),
          }
        : cause === undefined
          ? undefined
          : typeof cause === "string" ||
              typeof cause === "number" ||
              typeof cause === "boolean"
            ? sanitizeDiagnosticText(String(cause))
            : "Non-Error cause omitted",
  }
}

export class LobbyDurableObject extends DurableObject<Env> {
  private readonly store: LobbyStore
  private readonly tickets: SocketTicketService
  private readonly storage: DurableObjectStorage
  private readonly state: DurableObjectState
  private readonly now: () => number

  constructor(
    state: DurableObjectState,
    env: Env,
    store?: LobbyStore,
    ticketRepository?: SocketTicketRepository,
    now: () => number = Date.now,
  ) {
    super(state, env)
    this.state = state
    this.storage = state.storage
    this.now = now
    this.store = store ?? new SqliteLobbyStore(state.storage)
    this.tickets = new SocketTicketService(
      ticketRepository ?? new SqliteSocketTicketRepository(state.storage),
      now,
    )
  }

  listPublicLobbies(viewerUid?: string): LobbySummary[] {
    return this.store
      .listVisible(this.waitingCutoff(), viewerUid)
      .map(lobby => this.toSummary(lobby, viewerUid))
  }

  createLobby(
    input: CreateLobbyInput,
    identity: VerifiedIdentity,
  ): RpcResult<LobbySummary> {
    let lastCompletedStage: CreateLobbyDiagnosticStage = "create_lobby_begin"
    const completeStage = (stage: CreateLobbyDiagnosticStage) => {
      lastCompletedStage = stage
      console.info("Create lobby stage completed.", {
        event: stage,
        uid: identity.uid,
      })
    }
    completeStage("create_lobby_begin")
    try {
      const gameId = crypto.randomUUID()
      const playerId = crypto.randomUUID()
      const code = this.createUniqueCode()
      const attemptedAt = this.now()
      const createdAt = new Date(attemptedAt).toISOString()
      const displayName = displayNameFor(identity)
      const lobby: LobbyRecord = {
        id: gameId,
        code,
        title: input.title,
        hostUid: identity.uid,
        hostDisplayName: displayName,
        format: input.format,
        visibility: input.visibility,
        status: "waiting",
        playerCount: 1,
        maxPlayers: input.maxPlayers,
        createdAt,
        updatedAt: createdAt,
      }
      const host: ParticipantRecord = {
        gameId,
        uid: identity.uid,
        playerId,
        role: "player",
        displayName,
        seatNumber: 0,
        joinedAt: createdAt,
      }
      const created = this.store.createLobbyWithHost(
        lobby,
        host,
        attemptedAt,
        completeStage,
      )
      if (created.status === "rate-limit") {
        console.warn("Lobby creation rate limit exceeded.", {
          event: "lobby_creation_rate_limit_exceeded",
          uid: identity.uid,
        })
        return failure(
          429,
          "LOBBY_CREATE_RATE_LIMITED",
          "Te veel lobby-aanmaakpogingen. Probeer het later opnieuw.",
        )
      }
      if (created.status !== "inserted") {
        console.warn("Lobby quota exceeded.", {
          event: "lobby_quota_exceeded",
          uid: identity.uid,
          group: "waiting",
          limit: MAX_WAITING_LOBBIES_PER_UID,
        })
        return failure(
          409,
          "LOBBY_QUOTA_EXCEEDED",
          "Je hebt het maximum aantal wachtende lobby's bereikt.",
        )
      }
      this.scheduleNextCleanup()
      completeStage("create_lobby_alarm_schedule")
      const value = this.toSummary(lobby, identity.uid)
      completeStage("create_lobby_complete")
      return { ok: true, value }
    } catch (caught) {
      console.error("Unexpected lobby creation failure.", {
        event: "create_lobby_internal_error",
        uid: identity.uid,
        lastCompletedStage,
        ...errorDiagnostics(caught),
      })
      throw caught
    }
  }

  joinByCode(
    code: string,
    requestedRole: ConnectionRole,
    identity: VerifiedIdentity,
  ): RpcResult<JoinLobbyResult> {
    const lobby = this.store.getByCode(code.trim().toUpperCase())
    if (
      lobby?.status !== "waiting" ||
      Date.parse(lobby.createdAt) <= this.now() - WAITING_LOBBY_TTL_MS
    ) {
      return failure(404, "GAME_NOT_FOUND", "Lobby niet gevonden.")
    }
    const existing = this.store.getParticipant(lobby.id, identity.uid)
    const role = existing?.role ?? requestedRole
    const participant: ParticipantRecord =
      existing ??
      ({
        gameId: lobby.id,
        uid: identity.uid,
        playerId: role === "player" ? crypto.randomUUID() : null,
        role,
        displayName: displayNameFor(identity),
        seatNumber: role === "player" ? lobby.playerCount : null,
        joinedAt: new Date().toISOString(),
      } satisfies ParticipantRecord)
    const added = this.store.addParticipant(lobby.id, participant)
    if (added.status === "full") {
      return failure(409, "LOBBY_FULL", "Deze lobby is vol.")
    }
    if (added.status === "missing") {
      return failure(404, "GAME_NOT_FOUND", "Lobby niet gevonden.")
    }
    const updated = this.store.getById(lobby.id)
    if (!updated) {
      return failure(404, "GAME_NOT_FOUND", "Lobby niet gevonden.")
    }
    return {
      ok: true,
      value: {
        lobby: this.toSummary(updated, identity.uid),
        gameId: lobby.id,
        role: added.participant.role,
      },
    }
  }

  getLobbyRoom(
    gameId: string,
    identity: VerifiedIdentity,
  ): RpcResult<LobbyRoom> {
    const lobby = this.store.getById(gameId)
    const viewer = this.store.getParticipant(gameId, identity.uid)
    if (!lobby || !viewer || this.isExpiredWaiting(lobby)) {
      return failure(404, "GAME_NOT_FOUND", "Lobby niet gevonden.")
    }
    const decks = new Map(
      this.store
        .listDecks(gameId)
        .map(record => [record.uid, record.submission] as const),
    )
    return {
      ok: true,
      value: {
        lobby: this.toSummary(lobby, identity.uid),
        participants: this.store.listParticipants(gameId).map(participant => {
          const deck = decks.get(participant.uid)
          return {
            displayName: participant.displayName,
            role: participant.role,
            seatNumber: participant.seatNumber,
            isHost: participant.uid === lobby.hostUid,
            isViewer: participant.uid === identity.uid,
            deckReady: participant.role === "player" && Boolean(deck),
            deckName:
              participant.role === "player" ? (deck?.deckName ?? null) : null,
          }
        }),
      },
    }
  }

  registerDeck(
    gameId: string,
    identity: VerifiedIdentity,
    submission: OnlineDeckSubmission,
  ): RpcResult<null> {
    const lobby = this.store.getById(gameId)
    const participant = this.store.getParticipant(gameId, identity.uid)
    if (!lobby || !participant) {
      return failure(404, "GAME_NOT_FOUND", "Lobby niet gevonden.")
    }
    if (
      lobby.status !== "waiting" ||
      this.isExpiredWaiting(lobby) ||
      participant.role !== "player" ||
      !participant.playerId
    ) {
      return failure(
        409,
        "LOBBY_NOT_READY",
        "Voor deze deelnemer kan geen deck worden geregistreerd.",
      )
    }
    const parsed = onlineDeckSubmissionSchema.safeParse(submission)
    if (!parsed.success) {
      return failure(400, "INVALID_REQUEST", "Het gekozen deck is ongeldig.")
    }
    this.store.upsertDeck({
      gameId,
      uid: identity.uid,
      submission: parsed.data,
      registeredAt: new Date().toISOString(),
    })
    return { ok: true, value: null }
  }

  deleteLobby(gameId: string, identity: VerifiedIdentity): RpcResult<null> {
    const lobby = this.store.getById(gameId)
    if (!lobby) {
      return failure(404, "GAME_NOT_FOUND", "Lobby niet gevonden.")
    }
    if (lobby.hostUid !== identity.uid) {
      return failure(
        403,
        "FORBIDDEN",
        "Alleen de geverifieerde host kan deze lobby verwijderen.",
      )
    }
    if (lobby.status !== "waiting") {
      return failure(
        409,
        "LOBBY_ACTIVE",
        "Een gestarte battle kan niet als lobby worden verwijderd.",
      )
    }
    this.store.deleteLobby(gameId)
    return { ok: true, value: null }
  }

  getSession(gameId: string, uid: string): GameSession | null {
    const lobby = this.store.getById(gameId)
    const participant = this.store.getParticipant(gameId, uid)
    if (
      !lobby ||
      lobby.status === "finished" ||
      !participant ||
      this.isExpiredWaiting(lobby)
    ) {
      return null
    }
    return {
      gameId,
      uid,
      playerId: participant.playerId,
      role: participant.role,
      isHost: lobby.hostUid === uid,
    }
  }

  async issueSocketTicket(
    gameId: string,
    identity: VerifiedIdentity,
  ): Promise<RpcResult<{ ticket: string; expiresAt: string }>> {
    const session = this.getSession(gameId, identity.uid)
    if (!session) {
      return failure(403, "FORBIDDEN", "Je bent geen deelnemer aan deze game.")
    }
    try {
      return { ok: true, value: await this.tickets.issue(session) }
    } catch (caught) {
      if (caught instanceof SocketTicketIssueError) {
        return caught.reason === "rate-limit"
          ? failure(
              429,
              "TICKET_RATE_LIMITED",
              "Te veel socket-ticketaanvragen. Probeer het over een minuut opnieuw.",
            )
          : failure(
              409,
              "TICKET_LIMIT_REACHED",
              "Er zijn al twee ongebruikte socket-tickets voor deze game.",
            )
      }
      throw caught
    }
  }

  consumeSocketTicket(ticket: string) {
    return this.tickets.consume(ticket)
  }

  prepareRegisteredGame(
    gameId: string,
    identity: VerifiedIdentity,
  ): RpcResult<{
    seed: OnlineGameSeed
    session: GameSession
  }> {
    const session = this.getSession(gameId, identity.uid)
    if (!session?.isHost || session.role !== "player" || !session.playerId) {
      return failure(
        403,
        "FORBIDDEN",
        "Alleen de geverifieerde host kan de game starten.",
      )
    }
    const lobby = this.store.getById(gameId)
    if (lobby?.status !== "waiting") {
      return failure(
        409,
        "LOBBY_NOT_READY",
        "Deze lobby kan niet worden gestart.",
      )
    }
    const players = this.store.listPlayers(gameId)
    if (players.length !== lobby.maxPlayers) {
      return failure(
        409,
        "LOBBY_NOT_READY",
        "Alle seats moeten bezet zijn voordat de battle start.",
      )
    }
    const decks = new Map(
      this.store
        .listDecks(gameId)
        .map(record => [record.uid, record.submission] as const),
    )
    if (players.some(player => !decks.has(player.uid))) {
      return failure(
        409,
        "LOBBY_NOT_READY",
        "Iedere speler moet eerst een deck kiezen.",
      )
    }
    const seed = onlineGameSeedSchema.safeParse({
      gameId,
      title: lobby.title,
      players: players.map(participant => {
        const deck = decks.get(participant.uid)
        return {
          playerId: participant.playerId ?? "",
          uid: participant.uid,
          displayName: participant.displayName,
          deckSnapshotId: deck?.deckSnapshotId ?? "",
          deckName: deck?.deckName ?? "",
          cards: deck?.cards ?? [],
        }
      }),
    })
    if (!seed.success) {
      return failure(
        400,
        "INVALID_REQUEST",
        "De game-initialisatie is ongeldig.",
      )
    }
    const reserved = this.store.reserveLobbyStart(
      gameId,
      identity.uid,
      new Date(this.now()).toISOString(),
    )
    if (reserved === "quota") {
      console.warn("Lobby quota exceeded.", {
        event: "lobby_quota_exceeded",
        uid: identity.uid,
        group: "active",
        limit: MAX_ACTIVE_LOBBIES_PER_UID,
      })
      return failure(
        409,
        "LOBBY_QUOTA_EXCEEDED",
        "Je hebt het maximum aantal startende of actieve lobby's bereikt.",
      )
    }
    if (reserved === "missing") {
      return failure(409, "LOBBY_NOT_READY", "Deze lobby kan niet starten.")
    }
    this.scheduleNextCleanup()
    return { ok: true, value: { seed: seed.data, session } }
  }

  releaseGameStart(
    gameId: string,
    identity: VerifiedIdentity,
  ): RpcResult<null> {
    const lobby = this.store.getById(gameId)
    if (lobby?.hostUid !== identity.uid || lobby.status !== "starting") {
      return failure(409, "LOBBY_NOT_READY", "Deze lobby start niet.")
    }
    this.store.setStatus(gameId, "waiting", new Date(this.now()).toISOString())
    this.scheduleNextCleanup()
    return { ok: true, value: null }
  }

  markGameActive(gameId: string, identity: VerifiedIdentity): RpcResult<null> {
    const session = this.getSession(gameId, identity.uid)
    if (!session?.isHost) {
      return failure(
        403,
        "FORBIDDEN",
        "Alleen de geverifieerde host kan de lobbystatus wijzigen.",
      )
    }
    const activated = this.store.activateLobby(
      gameId,
      identity.uid,
      new Date(this.now()).toISOString(),
    )
    if (activated === "quota") {
      console.warn("Lobby quota exceeded.", {
        event: "lobby_quota_exceeded",
        uid: identity.uid,
        group: "active",
        limit: MAX_ACTIVE_LOBBIES_PER_UID,
      })
      return failure(
        409,
        "LOBBY_QUOTA_EXCEEDED",
        "Je hebt het maximum aantal actieve lobby's bereikt.",
      )
    }
    if (activated === "missing") {
      return failure(404, "GAME_NOT_FOUND", "Lobby niet gevonden.")
    }
    return { ok: true, value: null }
  }

  markGameFinished(
    gameId: string,
    identity: VerifiedIdentity,
  ): RpcResult<null> {
    const lobby = this.store.getById(gameId)
    if (!lobby) {
      return failure(404, "GAME_NOT_FOUND", "Game niet gevonden.")
    }
    if (lobby.hostUid !== identity.uid) {
      return failure(
        403,
        "FORBIDDEN",
        "Alleen de geverifieerde host kan de game afbreken.",
      )
    }
    if (lobby.status !== "active") {
      return failure(
        409,
        "LOBBY_NOT_READY",
        "Alleen een actieve game kan worden afgebroken.",
      )
    }
    this.store.setStatus(gameId, "finished", new Date(this.now()).toISOString())
    this.scheduleNextCleanup()
    return { ok: true, value: null }
  }

  alarm() {
    const now = this.now()
    try {
      const cleaned = this.store.cleanupExpired(
        new Date(now - STARTING_LOBBY_TIMEOUT_MS).toISOString(),
        new Date(now - WAITING_LOBBY_TTL_MS).toISOString(),
        new Date(now - FINISHED_LOBBY_RETENTION_MS).toISOString(),
      )
      console.info("Automatic lobby cleanup completed.", {
        event: "lobby_cleanup_completed",
        startingRecovered: cleaned.startingRecovered,
        waitingDeleted: cleaned.waiting,
        finishedDeleted: cleaned.finished,
        rateLimitsDeleted: cleaned.rateLimitsDeleted,
        totalDeleted: cleaned.waiting + cleaned.finished,
      })
      this.scheduleNextCleanup()
    } catch (caught) {
      console.error("Automatic lobby cleanup failed.", {
        event: "lobby_cleanup_failed",
        reason: caught instanceof Error ? caught.message : "UNKNOWN",
      })
      throw caught
    }
  }

  private createUniqueCode() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = randomCode(6)
      if (!this.store.getByCode(code)) return code
    }
    throw new Error("JOIN_CODE_EXHAUSTED")
  }

  private waitingCutoff() {
    return new Date(this.now() - WAITING_LOBBY_TTL_MS).toISOString()
  }

  private isExpiredWaiting(lobby: LobbyRecord) {
    return lobby.status === "waiting" && lobby.createdAt <= this.waitingCutoff()
  }

  private scheduleNextCleanup() {
    const expiration = this.store.nextExpirationAt()
    if (expiration) {
      this.state.waitUntil(this.storage.setAlarm(Date.parse(expiration)))
    }
  }

  private toSummary(lobby: LobbyRecord, viewerUid?: string): LobbySummary {
    const participant = viewerUid
      ? this.store.getParticipant(lobby.id, viewerUid)
      : null
    return {
      id: lobby.id,
      code: lobby.code,
      title: lobby.title,
      hostDisplayName: lobby.hostDisplayName,
      format: lobby.format,
      visibility: lobby.visibility,
      status: lobby.status,
      playerCount: lobby.playerCount,
      maxPlayers: lobby.maxPlayers,
      createdAt: lobby.createdAt,
      viewerRole:
        viewerUid === lobby.hostUid ? "host" : (participant?.role ?? null),
    }
  }
}
