import { DurableObject } from "cloudflare:workers"
import {
  parseGameCommand,
  type GameCommand,
  type ServerEvent,
} from "@mtg/game-protocol"
import {
  applyAuthoritativeCommand,
  createAuthoritativeGame,
  migrateAuthoritativeGame,
  serializePersonalSnapshot,
  type OnlineGameSeed,
} from "./game-server-adapter"
import {
  SqliteGameSnapshotStore,
  type GameSnapshotStore,
  type StoredGameRecord,
} from "./game-snapshot-store"
import {
  calculateBroadcastCost,
  connectionLimitViolation,
  MAX_GAME_COMMAND_MESSAGE_BYTES,
  MAX_SERIALIZED_PERSONAL_SNAPSHOT_BYTES,
  personalSnapshotViewKey,
  SqliteBroadcastBudget,
  SqliteCommandRateLimiter,
  validateGameRecordLimits,
  validatePersonalSnapshotLimits,
  validateSeedGrowthLimits,
  type BroadcastBudget,
  type CommandRateLimiter,
  type SerializedSnapshotView,
} from "./game-security"
import type {
  CommandResult,
  DurableObjectState,
  Env,
  GameSession,
  GameSnapshotResult,
  RpcResult,
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

type GameSocketAttachment = GameSession & {
  connectionId: string
  connectedAt: string
  lastSentVersion: number
}

type HandledCommandResult = CommandResult & {
  snapshotViews?: Map<string, SerializedSnapshotView>
}

const errorEvent = (
  gameId: string | undefined,
  code:
    | "FORBIDDEN"
    | "INVALID_COMMAND"
    | "VERSION_CONFLICT"
    | "NOT_READY"
    | "GAME_COMMAND_RATE_LIMITED"
    | "GAME_BROADCAST_RATE_LIMITED"
    | "GAME_STATE_LIMIT_REACHED"
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
    retryable:
      code === "VERSION_CONFLICT" ||
      code === "NOT_READY" ||
      code === "GAME_COMMAND_RATE_LIMITED" ||
      code === "GAME_BROADCAST_RATE_LIMITED",
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
  private currentSnapshotViews: Map<string, SerializedSnapshotView> | null =
    null
  private rejectedBroadcastCost = 0

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
    snapshotStore?: GameSnapshotStore,
    private readonly commandRateLimiter: CommandRateLimiter = new SqliteCommandRateLimiter(
      state.storage,
    ),
    private readonly now: () => number = Date.now,
    private readonly broadcastBudget: BroadcastBudget = new SqliteBroadcastBudget(
      state.storage,
    ),
  ) {
    super(state, env)
    this.snapshotStore =
      snapshotStore ?? new SqliteGameSnapshotStore(state.storage)
    this.ready = state.blockConcurrencyWhile(() => {
      const loaded = this.snapshotStore.load()
      if (!loaded) {
        this.record = null
        return Promise.resolve()
      }
      const game = migrateAuthoritativeGame(loaded.game)
      this.record = { ...loaded, game }
      const snapshotViews = validatePersonalSnapshotLimits(game)
      this.currentSnapshotViews = snapshotViews.valid
        ? snapshotViews.views
        : null
      if (game !== loaded.game) this.snapshotStore.save(this.record)
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
    const seedLimit = validateSeedGrowthLimits(seed)
    if (seedLimit) {
      this.logStateLimit(session, seedLimit)
      return {
        ok: true,
        value: errorEvent(
          session.gameId,
          "GAME_STATE_LIMIT_REACHED",
          "De game bevat te veel kaarten of definities om veilig te starten.",
        ),
      }
    }
    try {
      const game = createAuthoritativeGame(seed)
      const initialRecord = { game, processedCommands: {} }
      const validated = validateGameRecordLimits(initialRecord)
      if (!validated.valid) {
        this.logStateLimit(session, validated)
        return {
          ok: true,
          value: errorEvent(
            session.gameId,
            "GAME_STATE_LIMIT_REACHED",
            "De game is te groot om veilig te initialiseren.",
          ),
        }
      }
      const snapshotViews = validatePersonalSnapshotLimits(game)
      if (!snapshotViews.valid) {
        this.logStateLimit(session, snapshotViews)
        return {
          ok: true,
          value: errorEvent(
            session.gameId,
            "GAME_STATE_LIMIT_REACHED",
            "De persoonlijke gameweergave is te groot om veilig te versturen.",
          ),
        }
      }
      this.persist(initialRecord, validated.serialized)
      this.currentSnapshotViews = snapshotViews.views
      this.broadcastPersonalViews("INITIALIZE_GAME", -1, snapshotViews.views)
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
    const previousVersion = this.record?.game.version ?? -1
    const result = this.handleCommand(session, serialized)
    if (result.accepted && result.snapshotViews) {
      this.broadcastPersonalViews(
        command.type,
        previousVersion,
        result.snapshotViews,
      )
    }
    return { accepted: result.accepted, event: result.event }
  }

  async abortGame(session: GameSession): Promise<RpcResult<null>> {
    await this.ready
    if (!session.isHost || session.role !== "player") {
      return {
        ok: false,
        status: 403,
        code: "FORBIDDEN",
        message: "Alleen de geverifieerde host kan de game afbreken.",
      }
    }
    const event: ServerEvent = {
      type: "GAME_ABORTED",
      gameId: session.gameId,
      message: "De host heeft de game afgebroken.",
    }
    for (const socket of this.state.getWebSockets()) {
      socket.send(JSON.stringify(event))
      socket.close(1000, "Game afgebroken")
    }
    return { ok: true, value: null }
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
    const attachment = this.readSocketAttachment(socket)
    const session = attachment
    if (!session) {
      socket.close(1008, "Session missing")
      return
    }
    const previousVersion = this.record?.game.version ?? -1
    const result = this.handleCommand(session, message)
    try {
      socket.send(JSON.stringify(result.event))
    } catch {
      this.closeSocket(socket, 1011, "Acknowledgement failed")
    }
    if (result.accepted && result.snapshotViews) {
      const text =
        typeof message === "string"
          ? message
          : new TextDecoder().decode(new Uint8Array(message))
      const commandType = this.readCommandType(text)
      this.broadcastPersonalViews(
        commandType,
        previousVersion,
        result.snapshotViews,
      )
    }
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
    let initialMessage: string
    try {
      initialMessage = this.record
        ? this.serializeBoundedSnapshot(this.record.game, session)
        : JSON.stringify(
            errorEvent(
              session.gameId,
              "NOT_READY",
              "De host heeft de online game nog niet geïnitialiseerd.",
            ),
          )
    } catch {
      return new Response("Forbidden", { status: 403 })
    }
    if (!initialMessage) {
      this.logOutboundSnapshotLimit(session)
      return Response.json(
        {
          code: "GAME_STATE_LIMIT_REACHED",
          message: "De persoonlijke gameweergave is te groot.",
        },
        { status: 503 },
      )
    }
    const activeSessions = this.state
      .getWebSockets()
      .map(socket => this.readSocketAttachment(socket))
      .filter((attachment): attachment is GameSocketAttachment =>
        Boolean(attachment),
      )
    const connectionLimit = connectionLimitViolation(activeSessions, session)
    if (connectionLimit) {
      console.warn("WebSocket connection limit exceeded.", {
        event:
          connectionLimit === "SPECTATOR_CONNECTION_LIMIT_REACHED"
            ? "spectator_connection_limit_exceeded"
            : "websocket_uid_connection_limit_exceeded",
        code: connectionLimit,
        gameId: session.gameId,
        uid: session.uid,
        role: session.role,
      })
      return Response.json(
        {
          code: connectionLimit,
          message: "De WebSocket-verbindingslimiet voor deze game is bereikt.",
        },
        { status: 429 },
      )
    }
    const WebSocketPair = (
      globalThis as typeof globalThis & {
        WebSocketPair?: WebSocketPairConstructor
      }
    ).WebSocketPair
    if (!WebSocketPair) {
      return new Response("WebSocket runtime unavailable", { status: 501 })
    }
    const initialByteLength = new TextEncoder().encode(
      initialMessage,
    ).byteLength
    if (!this.broadcastBudget.reserve(initialByteLength, this.now())) {
      console.warn("Game broadcast byte budget exceeded.", {
        event: "game_broadcast_budget_exceeded",
        gameId: session.gameId,
        uid: session.uid,
        attemptedBytes: initialByteLength,
        operation: "socket_initial_snapshot",
      })
      return Response.json(
        {
          code: "GAME_BROADCAST_RATE_LIMITED",
          message: "De game verstuurt tijdelijk te veel snapshotdata.",
        },
        { status: 429 },
      )
    }
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    const attachment: GameSocketAttachment = {
      ...session,
      connectionId: crypto.randomUUID(),
      connectedAt: new Date().toISOString(),
      lastSentVersion: this.record?.game.version ?? -1,
    }
    server.serializeAttachment(attachment)
    this.state.acceptWebSocket(server)
    server.send(initialMessage)
    const UpgradeResponse = Response as unknown as UpgradeResponseConstructor
    return new UpgradeResponse(null, { status: 101, webSocket: client })
  }

  private handleCommand(
    session: GameSession,
    rawMessage: string | ArrayBuffer,
  ): HandledCommandResult {
    const byteLength =
      typeof rawMessage === "string"
        ? new TextEncoder().encode(rawMessage).byteLength
        : rawMessage.byteLength
    if (!this.commandRateLimiter.attempt(session.uid, this.now())) {
      console.warn("Game command rate limit exceeded.", {
        event: "game_command_rate_limit_exceeded",
        gameId: session.gameId,
        uid: session.uid,
      })
      return {
        accepted: false,
        event: errorEvent(
          session.gameId,
          "GAME_COMMAND_RATE_LIMITED",
          "Te veel gamecommands. Probeer het over enkele seconden opnieuw.",
        ),
      }
    }
    if (byteLength > MAX_GAME_COMMAND_MESSAGE_BYTES) {
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
    const serializedCommand =
      typeof rawMessage === "string"
        ? rawMessage
        : new TextDecoder().decode(new Uint8Array(rawMessage))
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
    const recipients = this.activeSocketAttachments()
    const currentBroadcastCost = this.currentSnapshotViews
      ? calculateBroadcastCost(
          this.currentSnapshotViews,
          recipients.map(recipient => recipient.attachment),
        )
      : 0
    const conservativeBroadcastCost = Math.max(
      currentBroadcastCost,
      this.rejectedBroadcastCost,
    )
    if (!this.broadcastBudget.allows(conservativeBroadcastCost, this.now())) {
      return this.broadcastBudgetError(
        session,
        command.commandId,
        game.version,
        conservativeBroadcastCost,
      )
    }
    const validated = validateGameRecordLimits(nextRecord)
    if (!validated.valid) {
      this.logStateLimit(session, validated)
      return {
        accepted: false,
        event: errorEvent(
          session.gameId,
          "GAME_STATE_LIMIT_REACHED",
          "Deze actie zou de veilige limiet voor de gamestate overschrijden.",
          {
            commandId: command.commandId,
            currentVersion: game.version,
          },
        ),
      }
    }
    const snapshotViews = validatePersonalSnapshotLimits(nextRecord.game)
    if (!snapshotViews.valid) {
      this.logStateLimit(session, snapshotViews)
      return {
        accepted: false,
        event: errorEvent(
          session.gameId,
          "GAME_STATE_LIMIT_REACHED",
          "Deze actie zou een te grote persoonlijke gameweergave maken.",
          {
            commandId: command.commandId,
            currentVersion: game.version,
          },
        ),
      }
    }
    const broadcastCost = calculateBroadcastCost(
      snapshotViews.views,
      recipients.map(recipient => recipient.attachment),
    )
    if (!this.broadcastBudget.reserve(broadcastCost, this.now())) {
      this.rejectedBroadcastCost = Math.max(
        this.rejectedBroadcastCost,
        broadcastCost,
      )
      console.warn("Game broadcast byte budget exceeded.", {
        event: "game_broadcast_budget_exceeded",
        gameId: session.gameId,
        uid: session.uid,
        attemptedBytes: broadcastCost,
      })
      return this.broadcastBudgetError(
        session,
        command.commandId,
        game.version,
        broadcastCost,
        false,
      )
    }
    this.persist(nextRecord, validated.serialized)
    this.currentSnapshotViews = snapshotViews.views
    this.rejectedBroadcastCost = 0
    return {
      accepted: true,
      snapshotViews: snapshotViews.views,
      event: acceptedEvent(
        session.gameId,
        command.commandId,
        nextRecord.game.version,
      ),
    }
  }

  private persist(record: StoredGameRecord, serialized?: string) {
    this.snapshotStore.save(record, serialized)
    this.record = record
  }

  private broadcastPersonalViews(
    commandType: GameCommand["type"] | "INITIALIZE_GAME" | "UNKNOWN",
    previousVersion: number,
    validatedViews: Map<string, SerializedSnapshotView>,
  ) {
    if (!this.record) return
    let sentSocketCount = 0
    const recipients: {
      connectionId: string
      playerId: string | null
      role: GameSession["role"]
      userId: string
    }[] = []
    for (const { socket, attachment } of this.activeSocketAttachments()) {
      try {
        const serializedView = validatedViews.get(
          personalSnapshotViewKey(attachment),
        )
        if (!serializedView) {
          this.closeSocket(socket, 1008, "Snapshot view missing")
          continue
        }
        socket.send(serializedView.serialized)
        sentSocketCount += 1
        recipients.push({
          connectionId: attachment.connectionId,
          playerId: attachment.playerId,
          role: attachment.role,
          userId: attachment.uid,
        })
        socket.serializeAttachment({
          ...attachment,
          lastSentVersion: this.record.game.version,
        } satisfies GameSocketAttachment)
      } catch {
        this.closeSocket(socket, 1008, "Snapshot delivery failed")
      }
    }
    if (this.env.REALTIME_DEBUG === "true") {
      console.info("Authoritative game state broadcast.", {
        gameId: this.record.game.gameId,
        commandType,
        previousVersion,
        newVersion: this.record.game.version,
        socketCount: sentSocketCount,
        recipients,
      })
    }
  }

  private activeSocketAttachments() {
    const recipients: {
      socket: WorkerWebSocket
      attachment: GameSocketAttachment
    }[] = []
    for (const socket of this.state.getWebSockets()) {
      const attachment = this.readSocketAttachment(socket)
      if (attachment) recipients.push({ socket, attachment })
      else this.closeSocket(socket, 1008, "Session missing")
    }
    return recipients
  }

  private readSocketAttachment(
    socket: WorkerWebSocket,
  ): GameSocketAttachment | null {
    const value = socket.deserializeAttachment() as
      Partial<GameSocketAttachment> | undefined
    if (
      !value?.gameId ||
      !value.uid ||
      (value.role !== "player" && value.role !== "spectator")
    ) {
      return null
    }
    return {
      gameId: value.gameId,
      uid: value.uid,
      playerId: value.playerId ?? null,
      role: value.role,
      isHost: value.isHost === true,
      connectionId: value.connectionId ?? "legacy-connection",
      connectedAt: value.connectedAt ?? new Date(0).toISOString(),
      lastSentVersion: value.lastSentVersion ?? -1,
    }
  }

  private readCommandType(
    serializedCommand: string,
  ): GameCommand["type"] | "UNKNOWN" {
    try {
      return parseGameCommand(JSON.parse(serializedCommand)).type
    } catch {
      return "UNKNOWN"
    }
  }

  private closeSocket(socket: WorkerWebSocket, code: number, reason: string) {
    try {
      socket.close(code, reason)
    } catch {
      // A disconnected hibernated socket can already be gone.
    }
  }

  webSocketClose() {
    // Cloudflare verwijdert de socket uit getWebSockets(); er is geen teller.
  }

  webSocketError(socket: WorkerWebSocket) {
    this.closeSocket(socket, 1011, "WebSocket error")
  }

  private logStateLimit(
    session: GameSession,
    violation: Exclude<
      ReturnType<typeof validateGameRecordLimits>,
      { valid: true }
    >,
  ) {
    console.warn("Game state resource limit exceeded.", {
      event:
        violation.violation === "serialized-bytes" ||
        violation.violation === "personal-snapshot-bytes"
          ? "game_state_size_limit_exceeded"
          : "game_state_instance_limit_exceeded",
      gameId: session.gameId,
      uid: session.uid,
      resource: violation.violation,
      actual: violation.actual,
      limit: violation.limit,
    })
  }

  private serializeBoundedSnapshot(
    game: StoredGameRecord["game"],
    session: GameSession,
  ) {
    const serialized = JSON.stringify(serializePersonalSnapshot(game, session))
    return new TextEncoder().encode(serialized).byteLength <=
      MAX_SERIALIZED_PERSONAL_SNAPSHOT_BYTES
      ? serialized
      : ""
  }

  private logOutboundSnapshotLimit(session: GameSession) {
    console.warn("Outbound personal snapshot limit exceeded.", {
      event: "outbound_snapshot_size_limit_exceeded",
      gameId: session.gameId,
      uid: session.uid,
      limit: MAX_SERIALIZED_PERSONAL_SNAPSHOT_BYTES,
    })
  }

  private broadcastBudgetError(
    session: GameSession,
    commandId: string,
    currentVersion: number,
    attemptedBytes: number,
    log = true,
  ): HandledCommandResult {
    if (log) {
      console.warn("Game broadcast byte budget exceeded.", {
        event: "game_broadcast_budget_exceeded",
        gameId: session.gameId,
        uid: session.uid,
        attemptedBytes,
        operation: "command_broadcast",
      })
    }
    return {
      accepted: false,
      event: errorEvent(
        session.gameId,
        "GAME_BROADCAST_RATE_LIMITED",
        "De game verstuurt tijdelijk te veel snapshotdata. Probeer het zo opnieuw.",
        { commandId, currentVersion },
      ),
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
