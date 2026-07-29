import { DurableObject } from "cloudflare:workers"
import {
  parseGameCommand,
  type GameCommand,
  type ServerEvent,
} from "../../src/game-protocol"
import {
  applyAuthoritativeCommand,
  createAuthoritativeGame,
  serializePersonalSnapshot,
  type OnlineGameSeed,
} from "./game-server-adapter"
import {
  SqliteGameSnapshotStore,
  type GameSnapshotStore,
  type StoredGameRecord,
} from "./game-snapshot-store"
import type {
  CommandResult,
  DurableObjectState,
  Env,
  GameSession,
  GameSnapshotResult,
  WorkerWebSocket,
} from "./types"

type WebSocketPairConstructor = new () => {
  0: WorkerWebSocket
  1: WorkerWebSocket
}

type UpgradeResponseConstructor = new (
  body?: BodyInit | null,
  init?: ResponseInit & { webSocket?: WorkerWebSocket },
) => Response

const errorEvent = (
  gameId: string | undefined,
  code:
    | "FORBIDDEN"
    | "INVALID_COMMAND"
    | "VERSION_CONFLICT"
    | "NOT_READY"
    | "INTERNAL_ERROR",
  message: string,
  options?: {
    commandId?: string
    currentVersion?: number
    snapshot?: ReturnType<typeof serializePersonalSnapshot>
  },
): ServerEvent => ({
  type: "ERROR",
  gameId,
  commandId: options?.commandId,
  error: {
    code,
    message,
    retryable: code === "VERSION_CONFLICT" || code === "NOT_READY",
    currentVersion: options?.currentVersion,
  },
  snapshot: options?.snapshot,
})

const acceptedEvent = (
  gameId: string,
  commandId: string,
  version: number,
): ServerEvent => ({
  type: "COMMAND_ACCEPTED",
  gameId,
  commandId,
  version,
})

const trimProcessedCommands = (commands: Record<string, number>) =>
  Object.fromEntries(Object.entries(commands).slice(-100))

export class GameDurableObject extends DurableObject<Env> {
  private readonly snapshotStore: GameSnapshotStore
  private readonly ready: Promise<void>
  private record: StoredGameRecord | null = null

  constructor(
    private readonly state: DurableObjectState,
    env: Env,
    snapshotStore?: GameSnapshotStore,
  ) {
    super(state, env)
    this.snapshotStore =
      snapshotStore ?? new SqliteGameSnapshotStore(state.storage)
    this.ready = state.blockConcurrencyWhile(() => {
      this.record = this.snapshotStore.load()
      return Promise.resolve()
    })
  }

  async initializeGame(
    seed: OnlineGameSeed,
    session: GameSession,
  ): Promise<GameSnapshotResult> {
    await this.ready
    if (!session.isHost || session.role !== "player" || !session.playerId) {
      return {
        ok: true,
        value: errorEvent(
          session.gameId,
          "FORBIDDEN",
          "Alleen de geverifieerde host kan de game initialiseren.",
        ),
      }
    }
    if (seed.gameId !== session.gameId) {
      return {
        ok: true,
        value: errorEvent(
          session.gameId,
          "FORBIDDEN",
          "De game-initialisatie hoort bij een andere game.",
        ),
      }
    }
    if (
      !seed.players.some(
        player =>
          player.playerId === session.playerId && player.uid === session.uid,
      )
    ) {
      return {
        ok: true,
        value: errorEvent(
          session.gameId,
          "FORBIDDEN",
          "De hostseat ontbreekt in de game-initialisatie.",
        ),
      }
    }
    if (this.record) {
      return this.personalSnapshotResult(session)
    }
    try {
      const game = createAuthoritativeGame(seed)
      this.persist({ game, processedCommands: {} })
      this.broadcastSnapshots()
      return {
        ok: true,
        value: serializePersonalSnapshot(game, session),
      }
    } catch {
      return {
        ok: true,
        value: errorEvent(
          session.gameId,
          "INVALID_COMMAND",
          "De game-initialisatie is ongeldig.",
        ),
      }
    }
  }

  async getPersonalSnapshot(session: GameSession): Promise<GameSnapshotResult> {
    await this.ready
    return this.personalSnapshotResult(session)
  }

  async executeCommand(
    session: GameSession,
    command: GameCommand,
  ): Promise<CommandResult> {
    await this.ready
    const serialized = JSON.stringify(command)
    const result = this.handleCommand(session, serialized)
    if (result.accepted) this.broadcastSnapshots()
    return result
  }

  async fetch(request: Request) {
    await this.ready
    const url = new URL(request.url)
    const session = this.readSession(request)
    if (!session) return new Response("Forbidden", { status: 403 })
    if (url.pathname === "/socket") {
      return this.openSocket(request, session)
    }
    return new Response("Not found", { status: 404 })
  }

  async webSocketMessage(
    socket: WorkerWebSocket,
    message: string | ArrayBuffer,
  ) {
    await this.ready
    const session = socket.deserializeAttachment() as GameSession | undefined
    if (!session) {
      socket.close(1008, "Session missing")
      return
    }
    const text =
      typeof message === "string"
        ? message
        : new TextDecoder().decode(new Uint8Array(message))
    const result = this.handleCommand(session, text)
    socket.send(JSON.stringify(result.event))
    if (result.accepted) this.broadcastSnapshots()
  }

  private personalSnapshotResult(session: GameSession): GameSnapshotResult {
    if (!this.record) {
      return {
        ok: true,
        value: errorEvent(
          session.gameId,
          "NOT_READY",
          "De host heeft de online game nog niet geïnitialiseerd.",
        ),
      }
    }
    try {
      return {
        ok: true,
        value: serializePersonalSnapshot(this.record.game, session),
      }
    } catch {
      return {
        ok: true,
        value: errorEvent(
          session.gameId,
          "FORBIDDEN",
          "De geverifieerde sessie hoort niet bij deze game.",
        ),
      }
    }
  }

  private openSocket(request: Request, session: GameSession) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 })
    }
    if (this.record) {
      try {
        serializePersonalSnapshot(this.record.game, session)
      } catch {
        return new Response("Forbidden", { status: 403 })
      }
    }
    const WebSocketPair = (
      globalThis as typeof globalThis & {
        WebSocketPair?: WebSocketPairConstructor
      }
    ).WebSocketPair
    if (!WebSocketPair) {
      return new Response("WebSocket runtime unavailable", { status: 501 })
    }
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    server.serializeAttachment(session)
    this.state.acceptWebSocket(server)
    server.send(
      JSON.stringify(
        this.record
          ? serializePersonalSnapshot(this.record.game, session)
          : errorEvent(
              session.gameId,
              "NOT_READY",
              "De host heeft de online game nog niet geïnitialiseerd.",
            ),
      ),
    )
    const UpgradeResponse = Response as unknown as UpgradeResponseConstructor
    return new UpgradeResponse(null, { status: 101, webSocket: client })
  }

  private handleCommand(
    session: GameSession,
    serializedCommand: string,
  ): CommandResult {
    if (new TextEncoder().encode(serializedCommand).byteLength > 16_384) {
      return {
        accepted: false,
        event: errorEvent(
          session.gameId,
          "INVALID_COMMAND",
          "Commandpayload is te groot.",
        ),
      }
    }
    if (session.role !== "player" || !session.playerId) {
      return {
        accepted: false,
        event: errorEvent(
          session.gameId,
          "FORBIDDEN",
          "Spectators kunnen geen gamecommands uitvoeren.",
        ),
      }
    }
    let command: GameCommand
    try {
      command = parseGameCommand(JSON.parse(serializedCommand))
    } catch {
      return {
        accepted: false,
        event: errorEvent(
          session.gameId,
          "INVALID_COMMAND",
          "Het command voldoet niet aan het gedeelde protocol.",
        ),
      }
    }
    if (!this.record) {
      return {
        accepted: false,
        event: errorEvent(
          session.gameId,
          "NOT_READY",
          "De host heeft de online game nog niet geïnitialiseerd.",
          { commandId: command.commandId },
        ),
      }
    }
    const record = this.record
    const game = record.game
    let viewerSnapshot: ReturnType<typeof serializePersonalSnapshot>
    try {
      viewerSnapshot = serializePersonalSnapshot(game, session)
    } catch {
      return {
        accepted: false,
        event: errorEvent(
          session.gameId,
          "FORBIDDEN",
          "De geverifieerde speler hoort niet bij deze game.",
          { commandId: command.commandId },
        ),
      }
    }
    const existingVersion = record.processedCommands[command.commandId]
    if (existingVersion !== undefined) {
      return {
        accepted: false,
        event: acceptedEvent(
          session.gameId,
          command.commandId,
          existingVersion,
        ),
      }
    }
    if (command.expectedVersion !== game.version) {
      return {
        accepted: false,
        event: errorEvent(
          session.gameId,
          "VERSION_CONFLICT",
          "De clientversie loopt achter op de server.",
          {
            commandId: command.commandId,
            currentVersion: game.version,
            snapshot: viewerSnapshot,
          },
        ),
      }
    }
    const applied = applyAuthoritativeCommand(game, session, command)
    if (!applied.accepted) {
      return {
        accepted: false,
        event: errorEvent(session.gameId, applied.code, applied.message, {
          commandId: command.commandId,
          currentVersion: game.version,
        }),
      }
    }
    const nextRecord: StoredGameRecord = {
      game: { ...applied.state, version: game.version + 1 },
      processedCommands: trimProcessedCommands({
        ...record.processedCommands,
        [command.commandId]: game.version + 1,
      }),
    }
    this.persist(nextRecord)
    return {
      accepted: true,
      event: acceptedEvent(
        session.gameId,
        command.commandId,
        nextRecord.game.version,
      ),
    }
  }

  private persist(record: StoredGameRecord) {
    this.record = record
    this.snapshotStore.save(record)
  }

  private broadcastSnapshots() {
    if (!this.record) return
    for (const socket of this.state.getWebSockets()) {
      const session = socket.deserializeAttachment() as GameSession | undefined
      if (!session) continue
      try {
        socket.send(
          JSON.stringify(serializePersonalSnapshot(this.record.game, session)),
        )
      } catch {
        socket.close(1008, "Forbidden session")
      }
    }
  }

  private readSession(request: Request): GameSession | null {
    const gameId = request.headers.get("X-Game-Id")
    const uid = request.headers.get("X-Verified-Uid")
    const role = request.headers.get("X-Connection-Role")
    if (!gameId || !uid || (role !== "player" && role !== "spectator")) {
      return null
    }
    return {
      gameId,
      uid,
      role,
      playerId: request.headers.get("X-Player-Id"),
      isHost: request.headers.get("X-Is-Host") === "true",
    }
  }
}
