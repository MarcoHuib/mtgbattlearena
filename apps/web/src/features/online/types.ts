import { z } from "zod"
import type { GameCommand, ServerEvent } from "@mtg/game-protocol"
import type { DeckSnapshot } from "@mtg/game-core/types"

export type ConnectionRole = "player" | "spectator"
export type LobbyVisibility = "public" | "private" | "invite-only"
export type LobbyStatus = "waiting" | "starting" | "active" | "finished"

export const arenaHealthSchema = z
  .object({
    status: z.literal("ok"),
    firebaseConfigured: z.boolean(),
  })
  .strict()

export type ArenaHealth = z.infer<typeof arenaHealthSchema>

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
    viewerRole: z.enum(["host", "player", "spectator"]).nullable(),
  })
  .strict()

export type OnlineLobby = z.infer<typeof onlineLobbySchema>

export const publicLobbySchema = onlineLobbySchema.omit({ createdAt: true })
export const lobbyListSchema = z.array(publicLobbySchema)
export type PublicLobby = z.infer<typeof publicLobbySchema>

export const lobbyParticipantSchema = z
  .object({
    displayName: z.string().min(1).max(80),
    role: z.enum(["player", "spectator"]),
    seatNumber: z.number().int().min(0).max(5).nullable(),
    isHost: z.boolean(),
    isViewer: z.boolean(),
    deckReady: z.boolean(),
    deckName: z.string().min(1).max(120).nullable(),
  })
  .strict()

export const lobbyRoomSchema = z
  .object({
    lobby: z.object({
      code: z.string().min(4).max(12),
      title: z.string().min(1).max(100),
      hostDisplayName: z.string().min(1).max(80),
      status: z.enum(["waiting", "starting", "active", "finished"]),
      maxPlayers: z.number().int().min(2).max(6),
      viewerRole: z.enum(["host", "player", "spectator"]).nullable(),
    }),
    participants: z.array(lobbyParticipantSchema),
  })
  .strict()

export type LobbyRoom = z.infer<typeof lobbyRoomSchema>

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
  signInWithMicrosoft(): Promise<AuthUser>
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
  gameId: string
  status: LobbyStatus
}

export type CreateLobbyResult = { id: string; status: LobbyStatus }

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
  checkHealth(signal?: AbortSignal): Promise<ArenaHealth>
  listPublicLobbies(signal?: AbortSignal): Promise<PublicLobby[]>
  createLobby(input: CreateLobbyInput): Promise<CreateLobbyResult>
  joinByCode(code: string): Promise<JoinLobbyResult>
  getLobbyRoom(gameId: string, signal?: AbortSignal): Promise<LobbyRoom>
  deleteLobby(gameId: string): Promise<void>
  abortGame(gameId: string): Promise<void>
  registerDeck(gameId: string, deck: DeckSnapshot): Promise<void>
  startGame(gameId: string): Promise<void>
  createSocketTicket(gameId: string): Promise<{
    ticket: string
  }>
  connectGame(gameId: string): Promise<OnlineGameConnection>
}
