import { DurableObject } from "cloudflare:workers"
import {
  onlineGameSeedSchema,
  onlineGameSubmissionSchema,
  type OnlineGameSeed,
  type OnlineGameSubmission,
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

  listPublicLobbies(): LobbySummary[] {
    return this.store.listPublic()
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
    return { ok: true, value: this.toSummary(lobby) }
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
        lobby: this.toSummary(updated),
        gameId: lobby.id,
        role: added.participant.role,
      },
    }
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

  prepareGame(
    gameId: string,
    identity: VerifiedIdentity,
    submission: OnlineGameSubmission,
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
    const parsed = onlineGameSubmissionSchema.safeParse(submission)
    if (!parsed.success || parsed.data.gameId !== gameId) {
      return failure(
        400,
        "INVALID_REQUEST",
        "De game-initialisatie is ongeldig.",
      )
    }
    const players = this.store.listPlayers(gameId)
    const submittedPlayerIds = parsed.data.players.map(
      player => player.playerId,
    )
    const assignedPlayerIds = players.flatMap(player =>
      player.playerId ? [player.playerId] : [],
    )
    if (
      assignedPlayerIds.length !== submittedPlayerIds.length ||
      assignedPlayerIds.some(playerId => !submittedPlayerIds.includes(playerId))
    ) {
      return failure(
        400,
        "INVALID_REQUEST",
        "De initialisatie moet exact de server-toegewezen seats bevatten.",
      )
    }
    const seed = onlineGameSeedSchema.safeParse({
      ...parsed.data,
      players: parsed.data.players.map(player => {
        const participant = players.find(
          candidate => candidate.playerId === player.playerId,
        )
        return {
          ...player,
          uid: participant?.uid ?? "",
          displayName: participant?.displayName ?? player.displayName,
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

  private toSummary(lobby: LobbyRecord): LobbySummary {
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
    }
  }
}
