import {
  onlineDeckSubmissionSchema,
  type OnlineDeckSubmission,
} from "@mtg/game-protocol"
import type { DeckSnapshot } from "@mtg/game-core/types"
import {
  arenaHealthSchema,
  lobbyListSchema,
  lobbyRoomSchema,
  onlineLobbySchema,
  type AuthService,
  type AuthState,
  type AuthUser,
  type CreateLobbyInput,
  type JoinLobbyResult,
  type OnlineGameService,
  type OnlineLobby,
} from "./types"
import { createFirebaseAuthPort, readFirebaseConfig } from "./firebaseAuth"
import { runtimeConfig } from "../../runtimeConfig"
import {
  addAppCheckHeader,
  createFirebaseAppCheckTokenProvider,
  setAppCheckTokenProvider,
} from "../../firebaseAppCheck"
import { MockRealtimeConnection } from "./mockRealtime"
import { CloudflareWebSocketConnection } from "./realtime"
import { store } from "../../app/store"
import { remoteGraphqlApi } from "../../app/api/remoteGraphqlApi"
import {
  setGraphQLAuthTokenProvider,
  setGraphQLBaseUrl,
} from "../../app/api/graphqlBaseQuery"
import type { LobbyVisibility as GraphQLLobbyVisibility } from "../../app/api/schemaTypes"

const normalizeGraphQLVisibility = (value: unknown) =>
  value === "invite_only" ? "invite-only" : value

const wait = (duration = 120) =>
  new Promise<void>(resolve => {
    setTimeout(resolve, duration)
  })

export const createOnlineDeckSubmission = (
  deck: DeckSnapshot,
): OnlineDeckSubmission => {
  const definitions = new Map(
    deck.definitions.map(definition => [definition.id, definition]),
  )
  return onlineDeckSubmissionSchema.parse({
    deckSnapshotId: deck.id,
    deckName: deck.name,
    cards: deck.cards.map(card => {
      const definition = definitions.get(card.definitionId)
      if (!definition) {
        throw new Error(
          `Kaartdefinitie ${card.definitionId} ontbreekt in ${deck.name}.`,
        )
      }
      const firstFace = definition.faces[0]
      return {
        definitionId: definition.id,
        name: firstFace?.name ?? definition.name,
        typeLine: firstFace?.typeLine ?? definition.typeLine,
        imageUrl: firstFace?.imageUrl ?? definition.imageRefs[0]?.url,
        scryfallId: definition.scryfallId,
        faces: definition.faces.map((face, faceIndex) => ({
          name: face.name,
          typeLine: face.typeLine,
          oracleText: face.oracleText,
          imageUrl:
            face.imageUrl ??
            definition.imageRefs.find(ref => ref.faceIndex === faceIndex)?.url,
        })),
        quantity: card.quantity,
        isCommander: card.isCommander,
      }
    }),
    tokens: deck.definitions
      .filter(definition => definition.token?.source === "deck")
      .map(definition => {
        const firstFace = definition.faces[0]
        return {
          definitionId: definition.id,
          name: firstFace?.name ?? definition.name,
          typeLine: firstFace?.typeLine ?? definition.typeLine,
          imageUrl: firstFace?.imageUrl ?? definition.imageRefs[0]?.url,
          scryfallId: definition.scryfallId,
          kind: definition.token?.kind ?? "other",
          power: definition.token?.power,
          toughness: definition.token?.toughness,
        }
      }),
  })
}

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

  async signInWithEmail(email: string) {
    this.state = { status: "loading", user: null }
    this.emit()
    await wait()
    const user: AuthUser = {
      uid: `mock-user-${crypto.randomUUID()}`,
      displayName: email.split("@")[0]?.trim() || "Planeswalker",
      isAnonymous: false,
    }
    this.state = { status: "signed-in", user }
    this.emit()
    return user
  }

  registerWithEmail(email: string) {
    return this.signInWithEmail(email)
  }

  signInWithGoogle() {
    return this.signInWithEmail("google-player@example.com")
  }

  signInWithMicrosoft() {
    return this.signInWithEmail("microsoft-player@example.com")
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

  signInWithEmail() {
    return Promise.reject(new Error(this.state.message))
  }

  registerWithEmail() {
    return Promise.reject(new Error(this.state.message))
  }

  signInWithGoogle() {
    return Promise.reject(new Error(this.state.message))
  }

  signInWithMicrosoft() {
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
  signInWithEmail(email: string, password: string): Promise<void>
  registerWithEmail(email: string, password: string): Promise<void>
  signInWithGoogle(): Promise<void>
  signInWithMicrosoft(): Promise<void>
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

  async signInWithEmail(email: string, password: string) {
    await this.firebase.signInWithEmail(email, password)
    return this.readSignedInUser()
  }

  async registerWithEmail(email: string, password: string) {
    await this.firebase.registerWithEmail(email, password)
    return this.readSignedInUser()
  }

  async signInWithGoogle() {
    await this.firebase.signInWithGoogle()
    return this.readSignedInUser()
  }

  async signInWithMicrosoft() {
    await this.firebase.signInWithMicrosoft()
    return this.readSignedInUser()
  }

  private readSignedInUser() {
    const user = this.firebase.currentUser
    if (!user) {
      throw new Error("Firebase heeft geen ingelogde gebruiker teruggegeven.")
    }
    const authUser: AuthUser = {
      uid: user.uid,
      displayName: user.displayName ?? "Planeswalker",
      isAnonymous: user.isAnonymous,
    }
    this.state = { status: "signed-in", user: authUser }
    this.emit()
    return authUser
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
    viewerRole: null,
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
    viewerRole: null,
  },
]

export class MockOnlineGameService implements OnlineGameService {
  readonly kind: OnlineGameService["kind"] = "mock"
  private readonly lobbies = initialMockLobbies.map(lobby => ({ ...lobby }))
  private readonly registeredDecks = new Map<string, string>()

  checkHealth() {
    return Promise.resolve({
      status: "ok" as const,
      firebaseConfigured: true,
    })
  }

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
      viewerRole: "host",
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
    lobby.viewerRole = "player"
    return { gameId: lobby.id, status: lobby.status }
  }

  async getLobbyRoom(gameId: string, signal?: AbortSignal) {
    await wait()
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
    const lobby = this.lobbies.find(candidate => candidate.id === gameId)
    if (!lobby) throw new Error("Lobby niet gevonden.")
    const participants = [
      {
        displayName: lobby.hostDisplayName,
        role: "player" as const,
        seatNumber: 0,
        isHost: true,
        isViewer: lobby.viewerRole === "host",
        deckReady: this.registeredDecks.has(`${gameId}:host`),
        deckName: this.registeredDecks.get(`${gameId}:host`) ?? null,
      },
    ]
    if (lobby.viewerRole === "player") {
      participants.push({
        displayName: "Jij",
        role: "player",
        seatNumber: Math.max(1, lobby.playerCount - 1),
        isHost: false,
        isViewer: true,
        deckReady: this.registeredDecks.has(`${gameId}:player`),
        deckName: this.registeredDecks.get(`${gameId}:player`) ?? null,
      })
    }
    return lobbyRoomSchema.parse({ lobby, participants })
  }

  async deleteLobby(gameId: string) {
    await wait()
    const index = this.lobbies.findIndex(candidate => candidate.id === gameId)
    if (index < 0) throw new Error("Lobby niet gevonden.")
    if (this.lobbies[index]?.viewerRole !== "host") {
      throw new Error("Alleen de host kan deze lobby verwijderen.")
    }
    this.lobbies.splice(index, 1)
  }

  async abortGame(gameId: string) {
    await wait()
    const lobby = this.lobbies.find(candidate => candidate.id === gameId)
    if (lobby?.viewerRole !== "host") {
      throw new Error("Alleen de host kan de game afbreken.")
    }
    lobby.status = "finished"
  }

  async registerDeck(gameId: string, deck: DeckSnapshot) {
    await wait()
    const lobby = this.lobbies.find(candidate => candidate.id === gameId)
    if (!lobby?.viewerRole) throw new Error("Lobby niet gevonden.")
    this.registeredDecks.set(`${gameId}:${lobby.viewerRole}`, deck.name)
  }

  async startGame(gameId: string) {
    await wait()
    const lobby = this.lobbies.find(candidate => candidate.id === gameId)
    if (lobby?.viewerRole !== "host") {
      throw new Error("Alleen de host kan de battle starten.")
    }
    if (lobby.playerCount !== lobby.maxPlayers) {
      throw new Error("Alle seats moeten bezet zijn.")
    }
    lobby.status = "active"
  }

  createSocketTicket() {
    return Promise.resolve({
      ticket: `mock-ticket-${crypto.randomUUID()}`,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    })
  }

  connectGame(gameId: string) {
    const requestedPlayerId =
      typeof localStorage === "undefined"
        ? null
        : localStorage.getItem("mtg-mock-player-id")
    const viewerPlayerId = [
      "mock-player-1",
      "mock-player-2",
      "mock-player-3",
      "mock-player-4",
    ].includes(requestedPlayerId ?? "")
      ? (requestedPlayerId ?? undefined)
      : undefined
    return Promise.resolve(new MockRealtimeConnection(gameId, viewerPlayerId))
  }
}

export class CloudflareOnlineGameService implements OnlineGameService {
  readonly kind = "cloudflare" as const

  constructor(
    private readonly baseUrl: string,
    private readonly auth: AuthService,
    private readonly socketBaseUrl = baseUrl,
  ) {
    setGraphQLAuthTokenProvider(() => this.auth.getIdToken())
    setGraphQLBaseUrl(this.baseUrl)
  }

  async checkHealth(signal?: AbortSignal) {
    return arenaHealthSchema.parse(
      await this.request("/api/online/health", { signal }, false),
    )
  }

  async listPublicLobbies(signal?: AbortSignal) {
    const request = store.dispatch(
      remoteGraphqlApi.endpoints.PublicLobbies.initiate(undefined, {
        subscribe: false,
        forceRefetch: true,
      }),
    )
    signal?.addEventListener(
      "abort",
      () => {
        request.abort()
      },
      { once: true },
    )
    const result = await request.unwrap()
    return lobbyListSchema.parse(
      result.publicLobbies.map(lobby => ({
        ...lobby,
        visibility: normalizeGraphQLVisibility(lobby.visibility),
      })),
    )
  }

  async createLobby(input: CreateLobbyInput) {
    const result = await store
      .dispatch(
        remoteGraphqlApi.endpoints.CreateLobby.initiate({
          input: {
            ...input,
            visibility: input.visibility.replace(
              "invite-only",
              "invite_only",
            ) as GraphQLLobbyVisibility,
          },
        }),
      )
      .unwrap()
    return result.createLobby
  }

  async joinByCode(code: string) {
    const result = (
      await store
        .dispatch(
          remoteGraphqlApi.endpoints.JoinLobby.initiate({ input: { code } }),
        )
        .unwrap()
    ).joinLobby
    return {
      gameId: result.gameId,
      status: result.lobby.status,
    } satisfies JoinLobbyResult
  }

  async getLobbyRoom(gameId: string, signal?: AbortSignal) {
    const request = store.dispatch(
      remoteGraphqlApi.endpoints.Lobby.initiate(
        { id: gameId },
        { subscribe: false, forceRefetch: true },
      ),
    )
    signal?.addEventListener(
      "abort",
      () => {
        request.abort()
      },
      { once: true },
    )
    const result = (await request.unwrap()).lobby
    return lobbyRoomSchema.parse({
      ...result,
    })
  }

  async deleteLobby(gameId: string) {
    await store
      .dispatch(remoteGraphqlApi.endpoints.DeleteLobby.initiate({ id: gameId }))
      .unwrap()
  }

  async abortGame(gameId: string) {
    await store
      .dispatch(remoteGraphqlApi.endpoints.AbortGame.initiate({ gameId }))
      .unwrap()
  }

  async registerDeck(gameId: string, deck: DeckSnapshot) {
    await store
      .dispatch(
        remoteGraphqlApi.endpoints.RegisterDeck.initiate({
          gameId,
          deck: createOnlineDeckSubmission(deck),
        }),
      )
      .unwrap()
  }

  async startGame(gameId: string) {
    await store
      .dispatch(remoteGraphqlApi.endpoints.StartGame.initiate({ gameId }))
      .unwrap()
  }

  async createSocketTicket(gameId: string) {
    const result = (
      await store
        .dispatch(
          remoteGraphqlApi.endpoints.CreateSocketTicket.initiate({ gameId }),
        )
        .unwrap()
    ).createSocketTicket
    return {
      ticket: result.ticket,
    }
  }

  connectGame(gameId: string) {
    return Promise.resolve(
      new CloudflareWebSocketConnection(
        new URL("/api/online/socket", this.socketBaseUrl).toString(),
        () => this.createSocketTicket(gameId),
      ),
    )
  }

  private async request(
    path: string,
    init: RequestInit = {},
    authenticated: boolean | "optional" = true,
  ): Promise<unknown> {
    const token = authenticated === false ? null : await this.auth.getIdToken()
    if (authenticated === true && !token) throw new Error("Log eerst in.")
    const headers = new Headers(init.headers)
    if (init.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }
    if (token) headers.set("Authorization", `Bearer ${token}`)
    if (path !== "/api/online/health") await addAppCheckHeader(headers)
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
  const configuredApiUrl: unknown = runtimeConfig.onlineApiUrl
  const configuredSocketUrl: unknown = runtimeConfig.onlineSocketUrl
  const remoteApiUrl =
    typeof configuredApiUrl === "string" && configuredApiUrl.trim()
      ? configuredApiUrl
      : null
  const apiUrl =
    remoteApiUrl && import.meta.env.DEV ? window.location.origin : remoteApiUrl
  const socketUrl =
    typeof configuredSocketUrl === "string" && configuredSocketUrl.trim()
      ? configuredSocketUrl
      : remoteApiUrl
  if (apiUrl) {
    const firebaseConfig = readFirebaseConfig({
      VITE_FIREBASE_API_KEY: runtimeConfig.firebaseApiKey,
      VITE_FIREBASE_AUTH_DOMAIN: runtimeConfig.firebaseAuthDomain,
      VITE_FIREBASE_PROJECT_ID: runtimeConfig.firebaseProjectId,
      VITE_FIREBASE_APP_ID: runtimeConfig.firebaseAppId,
      VITE_FIREBASE_MEASUREMENT_ID: runtimeConfig.firebaseMeasurementId,
    })
    const appCheckSiteKey =
      runtimeConfig.firebaseAppCheckRecaptchaEnterpriseSiteKey.trim()
    if (!firebaseConfig.configured) {
      const missingConfiguration = [...firebaseConfig.missing]
      const auth = new UnavailableAuthService(
        `Firebase-configuratie ontbreekt (${missingConfiguration.join(", ")}). Offline spelen blijft beschikbaar.`,
      )
      return {
        auth,
        onlineGames: new CloudflareOnlineGameService(
          apiUrl,
          auth,
          socketUrl ?? apiUrl,
        ),
      }
    }
    if (!appCheckSiteKey) {
      const auth = new UnavailableAuthService(
        "Firebase-configuratie ontbreekt (FIREBASE_APP_CHECK_RECAPTCHA_ENTERPRISE_SITE_KEY). Offline spelen blijft beschikbaar.",
      )
      return {
        auth,
        onlineGames: new CloudflareOnlineGameService(
          apiUrl,
          auth,
          socketUrl ?? apiUrl,
        ),
      }
    }
    if (import.meta.env.MODE !== "test") {
      setAppCheckTokenProvider(
        createFirebaseAppCheckTokenProvider(
          firebaseConfig.options,
          appCheckSiteKey,
          import.meta.env.DEV,
        ),
      )
    }
    const auth = new FirebaseAuthService(
      createFirebaseAuthPort(firebaseConfig.options),
    )
    setGraphQLAuthTokenProvider(() => auth.getIdToken())
    return {
      auth,
      onlineGames: new CloudflareOnlineGameService(
        apiUrl,
        auth,
        socketUrl ?? apiUrl,
      ),
    }
  }
  const auth = new MockAuthService()
  return {
    auth,
    onlineGames: new MockOnlineGameService(),
  }
}
