import { z } from "zod"
import type {
  GameCommand,
  PersonalGameSnapshot,
  ServerEvent,
} from "@mtg/game-protocol"

export type ConnectionRole = "player" | "spectator"
export type LobbyVisibility = "public" | "private" | "invite-only"
export type LobbyStatus = "waiting" | "starting" | "active" | "finished"

export const onlineLobbySchema = z
  .object({
    id: z.string().min(1),
    code: z.string().min(4).max(12),
    title: z.string().min(1).max(100),
    hostDisplayName: z.string().min(1).max(80),
    format: z.string().min(1).max(40),
    visibility: z.enum(["public", "private", "invite-only"]),
    status: z.enum(["waiting", "starting", "active", "finished"]),
    playerCount: z.number().int().min(0).max(6),
    maxPlayers: z.number().int().min(2).max(6),
    createdAt: z.iso.datetime(),
  })
  .strict()

export const lobbyListSchema = z.array(onlineLobbySchema)

export type OnlineLobby = z.infer<typeof onlineLobbySchema>

export type AuthUser = {
  uid: string
  displayName: string
  isAnonymous: boolean
}

export type AuthState =
  | { status: "loading"; user: null }
  | { status: "signed-out"; user: null }
  | { status: "signed-in"; user: AuthUser }
  | { status: "error"; user: null; message: string }

export type AuthService = {
  getState(): AuthState
  subscribe(listener: (state: AuthState) => void): () => void
  signInWithEmail(email: string, password: string): Promise<AuthUser>
  registerWithEmail(email: string, password: string): Promise<AuthUser>
  signInWithGoogle(): Promise<AuthUser>
  signOut(): Promise<void>
  getIdToken(): Promise<string | null>
}

export type CreateLobbyInput = {
  title: string
  format: string
  visibility: LobbyVisibility
  maxPlayers: number
}

export type JoinLobbyResult = {
  lobby: OnlineLobby
  gameId: string
  role: ConnectionRole
}

export type OnlineConnectionStatus =
  "connecting" | "connected" | "reconnecting" | "disconnected" | "error"

export type OnlineConnectionUpdate =
  | { type: "status"; status: OnlineConnectionStatus; message?: string }
  | { type: "event"; event: ServerEvent }

export type OnlineGameConnection = {
  subscribe(listener: (update: OnlineConnectionUpdate) => void): () => void
  send(command: GameCommand): void
  reconnect(): void
  close(): void
}

export type OnlineGameService = {
  readonly kind: "mock" | "cloudflare"
  listPublicLobbies(signal?: AbortSignal): Promise<OnlineLobby[]>
  createLobby(input: CreateLobbyInput): Promise<OnlineLobby>
  joinByCode(code: string): Promise<JoinLobbyResult>
  createSocketTicket(gameId: string): Promise<{
    ticket: string
    expiresAt: string
  }>
  sendCommand(gameId: string, command: GameCommand): Promise<ServerEvent>
  getPersonalSnapshot(gameId: string): Promise<PersonalGameSnapshot>
  connectGame(gameId: string): Promise<OnlineGameConnection>
}
