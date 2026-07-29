import {
  parsePersonalSnapshot,
  parseServerEvent,
  type GameCommand,
} from "@mtg/game-protocol"
import {
  lobbyListSchema,
  onlineLobbySchema,
  type AuthService,
  type AuthState,
  type AuthUser,
  type CreateLobbyInput,
  type JoinLobbyResult,
  type OnlineGameService,
  type OnlineLobby,
} from "./types"
import { MockRealtimeConnection } from "./mockRealtime"
import { CloudflareWebSocketConnection } from "./realtime"

const wait = (duration = 120) =>
  new Promise<void>(resolve => {
    setTimeout(resolve, duration)
  })

export class MockAuthService implements AuthService {
  private state: AuthState = { status: "signed-out", user: null }
  private readonly listeners = new Set<(state: AuthState) => void>()

  getState() {
    return this.state
  }

  subscribe(listener: (state: AuthState) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async signInAnonymously(displayName = "Planeswalker") {
    this.state = { status: "loading", user: null }
    this.emit()
    await wait()
    const user: AuthUser = {
      uid: `mock-user-${crypto.randomUUID()}`,
      displayName: displayName.trim() || "Planeswalker",
      isAnonymous: true,
    }
    this.state = { status: "signed-in", user }
    this.emit()
    return user
  }

  async signOut() {
    await wait(40)
    this.state = { status: "signed-out", user: null }
    this.emit()
  }

  getIdToken() {
    return Promise.resolve(
      this.state.status === "signed-in" ? "mock-development-token" : null,
    )
  }

  private emit() {
    for (const listener of this.listeners) listener(this.state)
  }
}

export class UnavailableAuthService implements AuthService {
  private readonly state: Extract<AuthState, { status: "error" }>

  constructor(message: string) {
    this.state = { status: "error", user: null, message }
  }

  getState() {
    return this.state
  }

  subscribe() {
    return () => undefined
  }

  signInAnonymously() {
    return Promise.reject(new Error(this.state.message))
  }

  signOut() {
    return Promise.resolve()
  }

  getIdToken() {
    return Promise.resolve(null)
  }
}

export type FirebaseAuthPort = {
  currentUser: {
    uid: string
    displayName: string | null
    isAnonymous: boolean
    getIdToken(forceRefresh?: boolean): Promise<string>
  } | null
  onAuthStateChanged(
    listener: (user: FirebaseAuthPort["currentUser"]) => void,
  ): () => void
  signInAnonymously(): Promise<void>
  signOut(): Promise<void>
}

export class FirebaseAuthService implements AuthService {
  private state: AuthState = { status: "loading", user: null }
  private readonly listeners = new Set<(state: AuthState) => void>()

  constructor(private readonly firebase: FirebaseAuthPort) {
    firebase.onAuthStateChanged(user => {
      this.state = user
        ? {
            status: "signed-in",
            user: {
              uid: user.uid,
              displayName: user.displayName ?? "Planeswalker",
              isAnonymous: user.isAnonymous,
            },
          }
        : { status: "signed-out", user: null }
      this.emit()
    })
  }

  getState() {
    return this.state
  }

  subscribe(listener: (state: AuthState) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async signInAnonymously() {
    await this.firebase.signInAnonymously()
    const state = this.getState()
    if (state.status !== "signed-in") {
      throw new Error("Firebase heeft geen ingelogde gebruiker teruggegeven.")
    }
    return state.user
  }

  signOut() {
    return this.firebase.signOut()
  }

  getIdToken() {
    return this.firebase.currentUser?.getIdToken() ?? Promise.resolve(null)
  }

  private emit() {
    for (const listener of this.listeners) listener(this.state)
  }
}

const initialMockLobbies: OnlineLobby[] = [
  {
    id: "mock-lobby-commander",
    code: "BATTLE",
    title: "Casual Commander",
    hostDisplayName: "Ajani",
    format: "Commander",
    visibility: "public",
    status: "waiting",
    playerCount: 2,
    maxPlayers: 4,
    createdAt: "2026-07-29T18:00:00.000Z",
  },
  {
    id: "mock-lobby-duel",
    code: "DUEL42",
    title: "Open tafel",
    hostDisplayName: "Chandra",
    format: "Commander",
    visibility: "public",
    status: "waiting",
    playerCount: 1,
    maxPlayers: 2,
    createdAt: "2026-07-29T18:15:00.000Z",
  },
]

export class MockOnlineGameService implements OnlineGameService {
  readonly kind = "mock" as const
  private readonly lobbies = initialMockLobbies.map(lobby => ({ ...lobby }))

  async listPublicLobbies(signal?: AbortSignal) {
    await wait()
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
    return this.lobbies.filter(lobby => lobby.visibility === "public")
  }

  async createLobby(input: CreateLobbyInput) {
    await wait()
    const parsed = onlineLobbySchema.parse({
      id: `mock-game-${crypto.randomUUID()}`,
      code: crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase(),
      title: input.title,
      hostDisplayName: "Jij",
      format: input.format,
      visibility: input.visibility,
      status: "waiting",
      playerCount: 1,
      maxPlayers: input.maxPlayers,
      createdAt: new Date().toISOString(),
    })
    this.lobbies.unshift(parsed)
    return parsed
  }

  async joinByCode(code: string): Promise<JoinLobbyResult> {
    await wait()
    const lobby = this.lobbies.find(
      candidate => candidate.code === code.trim().toUpperCase(),
    )
    if (!lobby) throw new Error("Geen lobby gevonden voor deze gamecode.")
    if (lobby.playerCount >= lobby.maxPlayers) {
      throw new Error("Deze lobby is vol.")
    }
    lobby.playerCount += 1
    return { lobby, gameId: lobby.id, role: "player" }
  }

  createSocketTicket() {
    return Promise.resolve({
      ticket: `mock-ticket-${crypto.randomUUID()}`,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    })
  }

  sendCommand(_gameId: string, command: GameCommand) {
    return Promise.resolve(
      parseServerEvent({
        type: "COMMAND_ACCEPTED",
        gameId: _gameId,
        commandId: command.commandId,
        version: command.expectedVersion + 1,
      }),
    )
  }

  getPersonalSnapshot() {
    return Promise.reject(
      new Error("De mocklobby heeft nog geen gestarte wedstrijdsnapshot."),
    )
  }

  connectGame(gameId: string) {
    return Promise.resolve(new MockRealtimeConnection(gameId))
  }
}

export class CloudflareOnlineGameService implements OnlineGameService {
  readonly kind = "cloudflare" as const

  constructor(
    private readonly baseUrl: string,
    private readonly auth: AuthService,
  ) {}

  async listPublicLobbies(signal?: AbortSignal) {
    return lobbyListSchema.parse(
      await this.request("/api/online/lobbies", { signal }, false),
    )
  }

  async createLobby(input: CreateLobbyInput) {
    return onlineLobbySchema.parse(
      await this.request("/api/online/lobbies", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    )
  }

  async joinByCode(code: string) {
    const result = await this.request("/api/online/lobbies/join", {
      method: "POST",
      body: JSON.stringify({ code }),
    })
    if (
      typeof result !== "object" ||
      result === null ||
      !("lobby" in result) ||
      !("gameId" in result) ||
      !("role" in result)
    ) {
      throw new Error("De server gaf een ongeldig joinantwoord.")
    }
    return {
      lobby: onlineLobbySchema.parse(result.lobby),
      gameId: String(result.gameId),
      role: result.role === "spectator" ? "spectator" : "player",
    } satisfies JoinLobbyResult
  }

  async createSocketTicket(gameId: string) {
    const result = await this.request("/api/online/socket-ticket", {
      method: "POST",
      body: JSON.stringify({ gameId }),
    })
    if (
      typeof result !== "object" ||
      result === null ||
      !("ticket" in result) ||
      !("expiresAt" in result)
    ) {
      throw new Error("De server gaf een ongeldig socket-ticket.")
    }
    return {
      ticket: String(result.ticket),
      expiresAt: String(result.expiresAt),
    }
  }

  async sendCommand(gameId: string, command: GameCommand) {
    return parseServerEvent(
      await this.request(
        `/api/online/games/${encodeURIComponent(gameId)}/commands`,
        {
          method: "POST",
          body: JSON.stringify(command),
        },
      ),
    )
  }

  async getPersonalSnapshot(gameId: string) {
    return parsePersonalSnapshot(
      await this.request(
        `/api/online/games/${encodeURIComponent(gameId)}/snapshot`,
      ),
    )
  }

  connectGame(gameId: string) {
    const connection = new CloudflareWebSocketConnection(
      new URL("/api/online/socket", this.baseUrl).toString(),
      () => this.createSocketTicket(gameId),
    )
    connection.start()
    return Promise.resolve(connection)
  }

  private async request(
    path: string,
    init: RequestInit = {},
    authenticated = true,
  ): Promise<unknown> {
    const token = authenticated ? await this.auth.getIdToken() : null
    if (authenticated && !token) throw new Error("Log eerst in.")
    const headers = new Headers(init.headers)
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }
    if (token) headers.set("Authorization", `Bearer ${token}`)
    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      headers,
    })
    const body = (await response.json()) as unknown
    if (!response.ok) {
      const message =
        typeof body === "object" &&
        body !== null &&
        "message" in body &&
        typeof body.message === "string"
          ? body.message
          : "De online service is niet bereikbaar."
      throw new Error(message)
    }
    return body
  }
}

export type ApplicationServices = {
  auth: AuthService
  onlineGames: OnlineGameService
}

export const createApplicationServices = (): ApplicationServices => {
  const configuredApiUrl: unknown = import.meta.env.VITE_ONLINE_API_URL
  const apiUrl =
    typeof configuredApiUrl === "string" && configuredApiUrl.trim()
      ? configuredApiUrl
      : null
  if (apiUrl) {
    const auth = new UnavailableAuthService(
      "Firebase is nog niet aan de webapp gekoppeld. Offline spelen blijft beschikbaar.",
    )
    return {
      auth,
      onlineGames: new CloudflareOnlineGameService(apiUrl, auth),
    }
  }
  const auth = new MockAuthService()
  return {
    auth,
    onlineGames: new MockOnlineGameService(),
  }
}
