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
  SqliteLobbyStore,
  type LobbyRecord,
  type LobbyStore,
  type ParticipantRecord,
} from "./lobby-storage"
import {
  SocketTicketService,
  SqliteSocketTicketRepository,
  type SocketTicketRepository,
} from "./tickets"
import type {
  ConnectionRole,
  CreateLobbyInput,
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

export class LobbyDurableObject extends DurableObject<Env> {
  private readonly store: LobbyStore
  private readonly tickets: SocketTicketService

  constructor(
    state: DurableObjectState,
    env: Env,
    store?: LobbyStore,
    ticketRepository?: SocketTicketRepository,
    now: () => number = Date.now,
  ) {
    super(state, env)
    this.store = store ?? new SqliteLobbyStore(state.storage)
    this.tickets = new SocketTicketService(
      ticketRepository ?? new SqliteSocketTicketRepository(state.storage),
      now,
    )
  }

  listPublicLobbies(viewerUid?: string): LobbySummary[] {
    return this.store
      .listVisible(viewerUid)
      .map(lobby => this.toSummary(lobby, viewerUid))
  }

  createLobby(
    input: CreateLobbyInput,
    identity: VerifiedIdentity,
  ): RpcResult<LobbySummary> {
    const gameId = crypto.randomUUID()
    const playerId = crypto.randomUUID()
    const code = this.createUniqueCode()
    const createdAt = new Date().toISOString()
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
    this.store.insertLobbyWithHost(lobby, host)
    return { ok: true, value: this.toSummary(lobby, identity.uid) }
  }

  joinByCode(
    code: string,
    requestedRole: ConnectionRole,
    identity: VerifiedIdentity,
  ): RpcResult<JoinLobbyResult> {
    const lobby = this.store.getByCode(code.trim().toUpperCase())
    if (lobby?.status !== "waiting") {
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
    if (!lobby || !viewer) {
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
    if (!lobby || !participant) return null
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
    return { ok: true, value: await this.tickets.issue(session) }
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
    return { ok: true, value: { seed: seed.data, session } }
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
    if (!this.store.setStatus(gameId, "active", new Date().toISOString())) {
      return failure(404, "GAME_NOT_FOUND", "Lobby niet gevonden.")
    }
    return { ok: true, value: null }
  }

  private createUniqueCode() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = randomCode(6)
      if (!this.store.getByCode(code)) return code
    }
    throw new Error("JOIN_CODE_EXHAUSTED")
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
