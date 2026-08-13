import type {
  GameCommand,
  OnlineDeckSubmission,
  PersonalGameSnapshot,
  ServerEvent,
} from "@mtg/game-protocol"
import type { ImportedDeck } from "@mtg/game-core/types"
import type { OnlineGameSeed } from "./game-server-adapter"

export type SqlStorageValue = string | number | ArrayBuffer | null

export type SqlStorageCursor<T extends object> = {
  toArray(): T[]
  one(): T
}

export type SqlStorage = {
  exec<T extends object = Record<string, unknown>>(
    query: string,
    ...bindings: SqlStorageValue[]
  ): SqlStorageCursor<T>
}

export type DurableObjectStorage = {
  sql: SqlStorage
  transactionSync<T>(callback: () => T): T
  getAlarm(): Promise<number | null>
  setAlarm(scheduledTime: number | Date): Promise<void>
}

export type DurableObjectState = {
  storage: DurableObjectStorage
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>
  waitUntil(promise: Promise<unknown>): void
  acceptWebSocket(socket: WorkerWebSocket): void
  getWebSockets(): WorkerWebSocket[]
}

export type WorkerWebSocket = {
  send(message: string): void
  close(code?: number, reason?: string): void
  serializeAttachment(value: unknown): void
  deserializeAttachment(): unknown
}

export type VerifiedIdentity = {
  uid: string
  name?: string
  email?: string
  anonymous: boolean
}

export type ConnectionRole = "player" | "spectator"
export type LobbyRole = "host" | ConnectionRole
export type LobbyVisibility = "public" | "private" | "invite-only"
export type LobbyStatus = "waiting" | "starting" | "active" | "finished"

export type GameSession = {
  gameId: string
  uid: string
  playerId: string | null
  role: ConnectionRole
  isHost: boolean
}

export type LobbySummary = {
  id: string
  code: string
  title: string
  hostDisplayName: string
  format: string
  visibility: LobbyVisibility
  status: LobbyStatus
  playerCount: number
  maxPlayers: number
  createdAt: string
  viewerRole: LobbyRole | null
}

export type LobbyParticipantSummary = {
  displayName: string
  role: ConnectionRole
  seatNumber: number | null
  isHost: boolean
  isViewer: boolean
  deckReady: boolean
  deckName: string | null
}

export type LobbyRoom = {
  lobby: LobbySummary
  participants: LobbyParticipantSummary[]
}

export type CreateLobbyInput = {
  title: string
  format: string
  visibility: LobbyVisibility
  maxPlayers: number
}

export type JoinLobbyResult = {
  lobby: LobbySummary
  gameId: string
  role: ConnectionRole
}

export type SocketTicket = {
  ticket: string
  expiresAt: string
}

export type RpcFailure = {
  ok: false
  status: number
  code: string
  message: string
}

export type RpcResult<T> = { ok: true; value: T } | RpcFailure

export type CommandResult = {
  event: ServerEvent
  accepted: boolean
}

export type GameSnapshotResult = RpcResult<PersonalGameSnapshot | ServerEvent>

export type LobbyDurableObjectStub = {
  fetch(request: Request): Promise<Response>
  listPublicLobbies(viewerUid?: string): Promise<LobbySummary[]>
  createLobby(
    input: CreateLobbyInput,
    identity: VerifiedIdentity,
  ): Promise<RpcResult<LobbySummary>>
  joinByCode(
    code: string,
    requestedRole: ConnectionRole,
    identity: VerifiedIdentity,
  ): Promise<RpcResult<JoinLobbyResult>>
  getLobbyRoom(
    gameId: string,
    identity: VerifiedIdentity,
  ): Promise<RpcResult<LobbyRoom>>
  deleteLobby(
    gameId: string,
    identity: VerifiedIdentity,
  ): Promise<RpcResult<null>>
  registerDeck(
    gameId: string,
    identity: VerifiedIdentity,
    submission: OnlineDeckSubmission,
  ): Promise<RpcResult<null>>
  getSession(gameId: string, uid: string): Promise<GameSession | null>
  issueSocketTicket(
    gameId: string,
    identity: VerifiedIdentity,
  ): Promise<RpcResult<SocketTicket>>
  consumeSocketTicket(ticket: string): Promise<GameSession | null>
  prepareRegisteredGame(
    gameId: string,
    identity: VerifiedIdentity,
  ): Promise<RpcResult<{ seed: OnlineGameSeed; session: GameSession }>>
  releaseGameStart(
    gameId: string,
    identity: VerifiedIdentity,
  ): Promise<RpcResult<null>>
  markGameActive(
    gameId: string,
    identity: VerifiedIdentity,
  ): Promise<RpcResult<null>>
  markGameFinished(
    gameId: string,
    identity: VerifiedIdentity,
  ): Promise<RpcResult<null>>
  resolveDeckRevision(
    deck: Omit<ImportedDeck, "source"> & { source: string },
  ): Promise<{
    deckId: string
    revisionId: string
  }>
}

export type GameDurableObjectStub = {
  fetch(request: Request): Promise<Response>
  initializeGame(
    seed: OnlineGameSeed,
    session: GameSession,
  ): Promise<GameSnapshotResult>
  getPersonalSnapshot(session: GameSession): Promise<GameSnapshotResult>
  executeCommand(
    session: GameSession,
    command: GameCommand,
  ): Promise<CommandResult>
  abortGame(session: GameSession): Promise<RpcResult<null>>
}

export type DurableObjectNamespace<TStub> = {
  getByName(name: string): TStub
}

export type WorkerService = {
  fetch(request: Request): Promise<Response>
}

export type Env = {
  LOBBY: DurableObjectNamespace<LobbyDurableObjectStub>
  GAMES: DurableObjectNamespace<GameDurableObjectStub>
  IMPORT: WorkerService
  FIREBASE_PROJECT_ID: string
  FIREBASE_PROJECT_NUMBER?: string
  FIREBASE_ALLOWED_APP_IDS?: string
  APP_CHECK_ENFORCEMENT?: string
  APP_ENV?: string
  ALLOWED_ORIGIN?: string
  REALTIME_DEBUG?: string
  RELEASE_VERSION?: string
  FIRESTORE_SERVICE_ACCOUNT_JSON?: string
}
