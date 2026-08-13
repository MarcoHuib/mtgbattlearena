import type { GameCommand, ServerEvent } from "@mtg/game-protocol"
import { parsePersonalSnapshot, parseServerEvent } from "@mtg/game-protocol"
import { GameDurableObject } from "../src/game-durable-object"
import {
  GAME_COMMAND_LIMIT,
  MAX_GAME_COMMAND_MESSAGE_BYTES,
  MAX_COUNTER_TYPES_PER_CARD,
  MAX_SERIALIZED_GAME_STATE_BYTES,
  MemoryBroadcastBudget,
  MemoryCommandRateLimiter,
} from "../src/game-security"
import type { BroadcastBudget } from "../src/game-security"
import type { OnlineGameSeed } from "../src/game-server-adapter"
import type { StoredGameRecord } from "../src/game-snapshot-store"
import type {
  DurableObjectState,
  Env,
  GameSession,
  SqlStorage,
  SqlStorageCursor,
  SqlStorageValue,
  WorkerWebSocket,
} from "../src/types"

class LocalSocket implements WorkerWebSocket {
  readonly messages: string[] = []
  closed: { code?: number; reason?: string } | null = null
  throwOnSend = false
  private attachment: unknown

  constructor(session: GameSession) {
    this.attachment = session
  }

  send(message: string) {
    if (this.throwOnSend) throw new Error("Socket is niet meer schrijfbaar.")
    this.messages.push(message)
  }

  close(code?: number, reason?: string) {
    this.closed = { code, reason }
  }

  serializeAttachment(value: unknown) {
    this.attachment = value
  }

  deserializeAttachment() {
    return this.attachment
  }

  events(): ServerEvent[] {
    return this.messages.map(message => parseServerEvent(JSON.parse(message)))
  }

  clearMessages() {
    this.messages.splice(0)
  }
}

class LocalGameSqlStorage implements SqlStorage {
  payload: string | null = null
  writeCount = 0

  exec<T extends object = Record<string, unknown>>(
    query: string,
    ...bindings: SqlStorageValue[]
  ): SqlStorageCursor<T> {
    let rows: T[] = []
    if (query.includes("SELECT payload FROM game_snapshots")) {
      rows = this.payload ? ([{ payload: this.payload }] as T[]) : []
    } else if (query.includes("INSERT INTO game_snapshots")) {
      const payload = bindings[2]
      if (typeof payload !== "string") {
        throw new Error("Game snapshot payload must be JSON text.")
      }
      this.payload = payload
      this.writeCount += 1
    }
    return {
      toArray: () => structuredClone(rows),
      one: () => {
        const row = rows[0]
        if (!row) throw new Error("Expected exactly one SQL row.")
        return structuredClone(row)
      },
    }
  }
}

class LocalDurableObjectEnvironment {
  readonly sockets: LocalSocket[] = []
  readonly durableObject: GameDurableObject

  constructor(
    readonly sql = new LocalGameSqlStorage(),
    now: () => number = Date.now,
    broadcastBudget: BroadcastBudget = new MemoryBroadcastBudget(),
  ) {
    const state: DurableObjectState = {
      storage: {
        sql,
        transactionSync: callback => callback(),
        getAlarm: () => Promise.resolve(null),
        setAlarm: () => Promise.resolve(),
      },
      blockConcurrencyWhile: callback => callback(),
      waitUntil: () => undefined,
      acceptWebSocket: socket => {
        this.sockets.push(socket as LocalSocket)
      },
      getWebSockets: () => this.sockets,
    }
    this.durableObject = new GameDurableObject(
      state,
      {} as Env,
      undefined,
      new MemoryCommandRateLimiter(),
      now,
      broadcastBudget,
    )
  }

  connect(session: GameSession) {
    const socket = new LocalSocket(session)
    this.sockets.push(socket)
    return socket
  }

  disconnect(socket: LocalSocket) {
    const index = this.sockets.indexOf(socket)
    if (index >= 0) this.sockets.splice(index, 1)
    socket.close(1000, "Test disconnect")
  }

  socketUpgrade(session: GameSession) {
    const headers = new Headers({
      Upgrade: "websocket",
      "X-Game-Id": session.gameId,
      "X-Verified-Uid": session.uid,
      "X-Connection-Role": session.role,
      "X-Is-Host": String(session.isHost),
    })
    if (session.playerId) headers.set("X-Player-Id", session.playerId)
    return this.durableObject.fetch(
      new Request("https://game.internal/socket", { headers }),
    )
  }

  async reconnect(session: GameSession) {
    const socket = this.connect(session)
    socket.send(JSON.stringify(await this.snapshot(session)))
    return socket
  }

  async socketCommand(socket: LocalSocket, command: GameCommand) {
    await this.durableObject.webSocketMessage(socket, JSON.stringify(command))
    return socket
      .events()
      .reverse()
      .find(event => event.type === "COMMAND_ACCEPTED")
  }

  async initialize(seed: OnlineGameSeed, host: GameSession) {
    return this.durableObject.initializeGame(seed, host)
  }

  async snapshot(session: GameSession) {
    const result = await this.durableObject.getPersonalSnapshot(session)
    if (!result.ok || result.value.type !== "PERSONAL_SNAPSHOT") {
      throw new Error("Persoonlijke snapshot verwacht.")
    }
    return parsePersonalSnapshot(result.value)
  }

  async command(session: GameSession, command: unknown) {
    return (
      await this.durableObject.executeCommand(session, command as GameCommand)
    ).event
  }

  async rawCommand(session: GameSession, body: string) {
    return this.command(session, JSON.parse(body))
  }
}

const gameId = "commander-integration-game"
const playerIds = ["seat-a", "seat-b", "seat-c", "seat-d"] as const

const playerSession = (index: number): GameSession => ({
  gameId,
  uid: `verified-user-${index + 1}`,
  playerId: playerIds[index] ?? null,
  role: "player",
  isHost: index === 0,
})

const spectatorSession: GameSession = {
  gameId,
  uid: "verified-spectator",
  playerId: null,
  role: "spectator",
  isHost: false,
}

const seed: OnlineGameSeed = {
  gameId,
  title: "Vier spelers Commander",
  players: playerIds.map((playerId, index) => ({
    playerId,
    uid: `verified-user-${index + 1}`,
    displayName: `Speler ${String.fromCharCode(65 + index)}`,
    deckSnapshotId: `deck-${playerId}`,
    deckName: `Deck ${playerId}`,
    cards: [
      {
        definitionId: `commander-${playerId}`,
        name: `Publieke commander ${playerId}`,
        typeLine: "Legendary Creature",
        quantity: 1,
        isCommander: true,
      },
      {
        definitionId: `hidden-${playerId}`,
        name: `Geheim van ${playerId}`,
        typeLine: "Creature — Hidden",
        imageRefs: [
          {
            resolver: 1,
            imageId: "6a9c39e4-a8cf-42dd-8d0e-45634b335546",
            faceIndex: 0,
            variant: "normal",
          },
          {
            resolver: 1,
            imageId: "6a9c39e4-a8cf-42dd-8d0e-45634b335546",
            faceIndex: 1,
            variant: "normal",
          },
        ],
        faces: [
          {
            name: `Geheim van ${playerId}`,
          },
          {
            name: `Andere zijde van ${playerId}`,
          },
        ],
        quantity: 30,
        isCommander: false,
      },
    ],
    tokens: [
      {
        definitionId: `token-${playerId}`,
        name: "Treasure",
        typeLine: "Token Artifact — Treasure",
        kind: "treasure",
      },
    ],
  })),
}

let commandCounter = 0
const command = (
  type: GameCommand["type"],
  expectedVersion: number,
  payload: unknown,
): GameCommand => {
  commandCounter += 1
  return {
    type,
    commandId: `00000000-0000-4000-8000-${String(commandCounter).padStart(12, "0")}`,
    expectedVersion,
    payload,
  } as GameCommand
}

const expectAccepted = (event: ServerEvent, expectedVersion: number): void => {
  expect(event).toMatchObject({
    type: "COMMAND_ACCEPTED",
    version: expectedVersion,
  })
}

describe("lokale Durable Object-omgeving met vier Commander-spelers", () => {
  let runtime: LocalDurableObjectEnvironment
  let playerSockets: LocalSocket[]
  let spectatorSocket: LocalSocket

  beforeEach(async () => {
    commandCounter = 0
    runtime = new LocalDurableObjectEnvironment()
    playerSockets = playerIds.map((_, index) =>
      runtime.connect(playerSession(index)),
    )
    spectatorSocket = runtime.connect(spectatorSession)
    const initialized = await runtime.initialize(seed, playerSession(0))
    if (!initialized.ok || initialized.value.type !== "PERSONAL_SNAPSHOT") {
      throw new Error("Initialisatie gaf geen persoonlijke snapshot.")
    }
  })

  const completeFirstPlayerRoll = async (): Promise<number> => {
    let version = 0
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const snapshot = await runtime.snapshot(playerSession(0))
      if (snapshot.firstPlayerRoll.status === "winner_determined") {
        version += 1
        expectAccepted(
          await runtime.command(
            playerSession(0),
            command("COMPLETE_FIRST_PLAYER_ROLL", version - 1, {}),
          ),
          version,
        )
        return version
      }
      const playerId = snapshot.firstPlayerRoll.eligiblePlayerIds.find(
        id => snapshot.firstPlayerRoll.rolls[id] === undefined,
      )
      if (!playerId) continue
      const index = playerIds.findIndex(candidate => candidate === playerId)
      version += 1
      expectAccepted(
        await runtime.command(
          playerSession(index),
          command("ROLL_FOR_FIRST_PLAYER", version - 1, {}),
        ),
        version,
      )
    }
    throw new Error("De startspelerworp is niet binnen 100 worpen afgerond.")
  }

  test("telt ook ongeldige commandspam en isoleert de allowance per UID", async () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined)
    const attacker = playerSockets[0]!
    for (let attempt = 0; attempt < GAME_COMMAND_LIMIT; attempt += 1) {
      await runtime.durableObject.webSocketMessage(attacker, "{}")
    }
    await runtime.durableObject.webSocketMessage(attacker, "{}")
    expect(attacker.events().at(-1)).toMatchObject({
      type: "ERROR",
      error: { code: "GAME_COMMAND_RATE_LIMITED" },
    })

    await runtime.durableObject.webSocketMessage(playerSockets[1]!, "{}")
    expect(playerSockets[1]!.events().at(-1)).toMatchObject({
      type: "ERROR",
      error: { code: "INVALID_COMMAND" },
    })
    warning.mockRestore()
  })

  test("begrensd ook commandachtige spectatorberichten per UID", async () => {
    spectatorSocket.clearMessages()
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined)
    for (let attempt = 0; attempt < GAME_COMMAND_LIMIT; attempt += 1) {
      await runtime.durableObject.webSocketMessage(spectatorSocket, "{}")
    }
    expect(spectatorSocket.events().at(-1)).toMatchObject({
      type: "ERROR",
      error: { code: "FORBIDDEN" },
    })
    await runtime.durableObject.webSocketMessage(spectatorSocket, "{}")
    expect(spectatorSocket.events().at(-1)).toMatchObject({
      type: "ERROR",
      error: { code: "GAME_COMMAND_RATE_LIMITED" },
    })
    warning.mockRestore()
  })

  test("wijst te grote string- en binaryframes vóór parsing af en telt ze", async () => {
    const socket = playerSockets[0]!
    socket.clearMessages()
    const oversizedString = "{".padEnd(MAX_GAME_COMMAND_MESSAGE_BYTES + 1, "x")
    await runtime.durableObject.webSocketMessage(socket, oversizedString)
    await runtime.durableObject.webSocketMessage(
      socket,
      new Uint8Array(MAX_GAME_COMMAND_MESSAGE_BYTES + 1).buffer,
    )
    expect(
      socket
        .events()
        .map(event => (event.type === "ERROR" ? event.error.code : event.type)),
    ).toEqual(["INVALID_COMMAND", "INVALID_COMMAND"])
    expect((await runtime.snapshot(playerSession(0))).version).toBe(0)

    for (let attempt = 2; attempt < GAME_COMMAND_LIMIT; attempt += 1) {
      await runtime.durableObject.webSocketMessage(socket, "{}")
    }
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined)
    await runtime.durableObject.webSocketMessage(socket, "{}")
    expect(socket.events().at(-1)).toMatchObject({
      type: "ERROR",
      error: { code: "GAME_COMMAND_RATE_LIMITED" },
    })
    warning.mockRestore()
  })

  test("weigert een derde actieve socket via de echte upgradeflow", async () => {
    const second = runtime.connect(playerSession(0))
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined)
    const rejected = await runtime.socketUpgrade(playerSession(0))
    expect(rejected.status).toBe(429)
    await expect(rejected.json()).resolves.toMatchObject({
      code: "WEBSOCKET_CONNECTION_LIMIT_REACHED",
    })
    expect(warning).toHaveBeenCalledWith(
      "WebSocket connection limit exceeded.",
      expect.objectContaining({
        gameId,
        uid: playerSession(0).uid,
      }),
    )
    runtime.disconnect(second)
    expect((await runtime.socketUpgrade(playerSession(0))).status).toBe(501)
    warning.mockRestore()
  })

  const keepAllOpeningHands = async (): Promise<number> => {
    let version = await completeFirstPlayerRoll()
    for (let index = 0; index < playerIds.length; index += 1) {
      version += 1
      expectAccepted(
        await runtime.command(
          playerSession(index),
          command("KEEP_HAND", version - 1, {}),
        ),
        version,
      )
    }
    return version
  }

  test("weigert stategroei atomair zonder snapshotwrite of broadcast", async () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined)
    let version = await keepAllOpeningHands()
    const hand = (await runtime.snapshot(playerSession(0))).privateView?.hand
    const instanceId = hand?.[0]?.instanceId
    if (!instanceId) throw new Error("Testkaart in hand ontbreekt.")
    version += 1
    expectAccepted(
      await runtime.command(
        playerSession(0),
        command("MOVE_CARD", version - 1, {
          instanceId,
          zone: "battlefield",
          position: { x: 0.5, y: 0.5, z: 1 },
        }),
      ),
      version,
    )

    const persisted = JSON.parse(runtime.sql.payload!) as StoredGameRecord
    const card = persisted.game.cardsById[instanceId]!
    card.counters = Object.fromEntries(
      Array.from({ length: MAX_COUNTER_TYPES_PER_CARD }, (_, index) => [
        `counter-${index}`,
        1,
      ]),
    )
    runtime.sql.payload = JSON.stringify(persisted)
    const writeCount = runtime.sql.writeCount
    runtime = new LocalDurableObjectEnvironment(runtime.sql)
    const socket = runtime.connect(playerSession(0))

    const rejected = await runtime.command(
      playerSession(0),
      command("SET_COUNTER", version, {
        instanceId,
        counter: "one-too-many",
        value: 1,
      }),
    )
    expect(rejected).toMatchObject({
      type: "ERROR",
      error: {
        code: "GAME_STATE_LIMIT_REACHED",
        currentVersion: version,
      },
    })
    expect(runtime.sql.writeCount).toBe(writeCount)
    expect((await runtime.snapshot(playerSession(0))).version).toBe(version)
    expect(socket.messages).toHaveLength(0)
    warning.mockRestore()
  })

  test("persistenteert of broadcast geen kandidaat boven de bytelimiet", async () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined)
    const version = await keepAllOpeningHands()
    const persisted = JSON.parse(runtime.sql.payload!) as StoredGameRecord
    const baseline = new TextEncoder().encode(
      JSON.stringify(persisted),
    ).byteLength
    persisted.game.title = "x".repeat(
      MAX_SERIALIZED_GAME_STATE_BYTES -
        baseline -
        1 +
        persisted.game.title.length,
    )
    runtime.sql.payload = JSON.stringify(persisted)
    expect(new TextEncoder().encode(runtime.sql.payload).byteLength).toBe(
      MAX_SERIALIZED_GAME_STATE_BYTES - 1,
    )
    const writeCount = runtime.sql.writeCount
    runtime = new LocalDurableObjectEnvironment(runtime.sql)
    const socket = runtime.connect(playerSession(0))

    const rejected = await runtime.command(
      playerSession(0),
      command("CHANGE_LIFE", version, { delta: -1 }),
    )
    expect(rejected).toMatchObject({
      type: "ERROR",
      error: { code: "GAME_STATE_LIMIT_REACHED", currentVersion: version },
    })
    expect(runtime.sql.writeCount).toBe(writeCount)
    expect(new TextEncoder().encode(runtime.sql.payload!).byteLength).toBe(
      MAX_SERIALIZED_GAME_STATE_BYTES - 1,
    )
    expect(socket.messages).toHaveLength(0)
    warning.mockRestore()
  })

  test("weigert een command atomair wanneer het gamebroadcastbudget op is", async () => {
    const version = await keepAllOpeningHands()
    const writeCount = runtime.sql.writeCount
    runtime = new LocalDurableObjectEnvironment(
      runtime.sql,
      Date.now,
      new MemoryBroadcastBudget(0),
    )
    const socket = runtime.connect(playerSession(0))
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined)

    const rejected = await runtime.command(
      playerSession(0),
      command("CHANGE_LIFE", version, { delta: -1 }),
    )
    expect(rejected).toMatchObject({
      type: "ERROR",
      error: {
        code: "GAME_BROADCAST_RATE_LIMITED",
        currentVersion: version,
      },
    })
    expect(runtime.sql.writeCount).toBe(writeCount)
    expect((await runtime.snapshot(playerSession(0))).version).toBe(version)
    expect(socket.messages).toHaveLength(0)
    warning.mockRestore()
  })

  test("serialiseert per verbinding zonder verborgen tegenstanderdata", async () => {
    const playerA = await runtime.snapshot(playerSession(0))
    const playerB = await runtime.snapshot(playerSession(1))
    const spectator = await runtime.snapshot(spectatorSession)

    expect(playerA.turnOrder).toHaveLength(4)
    expect(playerA.isHost).toBe(true)
    expect(playerB.isHost).toBe(false)
    expect(playerA.privateView?.hand).toHaveLength(7)
    expect(playerB.privateView?.hand).toHaveLength(7)
    expect(playerA.players["seat-b"]?.handCount).toBe(7)
    expect(playerA.players["seat-b"]?.libraryCount).toBe(23)
    expect(spectator.privateView).toBeNull()

    const serializedA = JSON.stringify(playerA)
    const serializedSpectator = JSON.stringify(spectator)
    expect(serializedA).not.toContain("Geheim van seat-b")
    expect(serializedA).not.toContain("seat-b-secret.jpg")
    expect(serializedA).not.toContain("scryfall-secret-seat-b")
    expect(serializedSpectator).not.toContain("Geheim van seat-")
    expect(serializedSpectator).not.toContain("scryfall-secret-")
    expect(Object.keys(playerA.players["seat-b"] ?? {})).not.toContain("hand")
    expect(Object.keys(playerA.players["seat-b"] ?? {})).not.toContain(
      "library",
    )

    const playerABroadcast = playerSockets[0]!
      .events()
      .reverse()
      .find(event => event.type === "PERSONAL_SNAPSHOT")
    const spectatorBroadcast = spectatorSocket
      .events()
      .reverse()
      .find(event => event.type === "PERSONAL_SNAPSHOT")
    expect(playerABroadcast?.type).toBe("PERSONAL_SNAPSHOT")
    expect(
      spectatorBroadcast?.type === "PERSONAL_SNAPSHOT"
        ? spectatorBroadcast.privateView
        : undefined,
    ).toBeNull()
  })

  test("synchroniseert twee sockets van één UID met dezelfde private view", async () => {
    const secondSocket = runtime.connect(playerSession(0))
    playerSockets[0]!.clearMessages()
    secondSocket.clearMessages()
    const version = await completeFirstPlayerRoll()
    const firstSnapshot = playerSockets[0]!.messages.at(-1)
    const secondSnapshot = secondSocket.messages.at(-1)
    expect(firstSnapshot).toBe(secondSnapshot)
    expect(parseServerEvent(JSON.parse(firstSnapshot!))).toMatchObject({
      type: "PERSONAL_SNAPSHOT",
      version,
      privateView: { playerId: "seat-a" },
    })
  })

  test("genereert worpen server-side en bewaart dezelfde openbare rollstate bij reconnect", async () => {
    const manipulated = await runtime.command(
      playerSession(0),
      command("ROLL_FOR_FIRST_PLAYER", 0, { value: 20 }),
    )
    expect(manipulated).toMatchObject({
      type: "ERROR",
      error: { code: "INVALID_COMMAND" },
    })

    expectAccepted(
      await runtime.command(
        playerSession(0),
        command("ROLL_FOR_FIRST_PLAYER", 0, {}),
      ),
      1,
    )
    const playerA = await runtime.snapshot(playerSession(0))
    const playerB = await runtime.snapshot(playerSession(1))
    const spectator = await runtime.snapshot(spectatorSession)
    expect(playerA.firstPlayerRoll.rolls["seat-a"]).toBeGreaterThanOrEqual(1)
    expect(playerA.firstPlayerRoll.rolls["seat-a"]).toBeLessThanOrEqual(20)
    expect(playerB.firstPlayerRoll).toEqual(playerA.firstPlayerRoll)
    expect(spectator.firstPlayerRoll).toEqual(playerA.firstPlayerRoll)

    const duplicate = await runtime.command(
      playerSession(0),
      command("ROLL_FOR_FIRST_PLAYER", 1, {}),
    )
    expect(duplicate).toMatchObject({
      type: "ERROR",
      error: { code: "INVALID_COMMAND" },
    })

    const reconnected = await runtime.snapshot({ ...playerSession(0) })
    expect(reconnected.firstPlayerRoll).toEqual(playerA.firstPlayerRoll)
  })

  test("laat alleen de host de game voor alle sockets afbreken", async () => {
    await expect(
      runtime.durableObject.abortGame(playerSession(1)),
    ).resolves.toMatchObject({ ok: false, code: "FORBIDDEN" })

    await expect(
      runtime.durableObject.abortGame(playerSession(0)),
    ).resolves.toEqual({ ok: true, value: null })

    for (const socket of [...playerSockets, spectatorSocket]) {
      expect(socket.events()).toContainEqual({
        type: "GAME_ABORTED",
        gameId,
        message: "De host heeft de game afgebroken.",
      })
      expect(socket.closed).toEqual({
        code: 1000,
        reason: "Game afgebroken",
      })
    }
  })

  test("laat iedere speler de eigen openingshand mulliganen en houden", async () => {
    const session = playerSession(0)
    const rollVersion = await completeFirstPlayerRoll()
    const blocked = await runtime.command(
      session,
      command("DRAW_CARD", rollVersion, { amount: 1 }),
    )
    expect(blocked).toMatchObject({
      type: "ERROR",
      error: { code: "NOT_READY" },
    })

    expectAccepted(
      await runtime.command(session, command("MULLIGAN_HAND", rollVersion, {})),
      rollVersion + 1,
    )
    let snapshot = await runtime.snapshot(session)
    expect(snapshot.openingHands["seat-a"]).toEqual({
      mulliganCount: 1,
      kept: false,
    })
    expect(snapshot.privateView?.hand).toHaveLength(7)

    expectAccepted(
      await runtime.command(session, command("KEEP_HAND", rollVersion + 1, {})),
      rollVersion + 2,
    )
    snapshot = await runtime.snapshot(session)
    expect(snapshot.openingHands["seat-a"]?.kept).toBe(true)
    expect(snapshot.openingHands["seat-b"]?.kept).toBe(false)
  })

  test("houdt online zeven kaarten zichtbaar en valideert de London-mulliganselectie", async () => {
    const session = playerSession(0)
    let version = await completeFirstPlayerRoll()
    for (let count = 0; count < 3; count += 1) {
      expectAccepted(
        await runtime.command(session, command("MULLIGAN_HAND", version, {})),
        version + 1,
      )
      version += 1
      expect((await runtime.snapshot(session)).privateView?.hand).toHaveLength(
        7,
      )
    }

    const missingSelection = await runtime.command(
      session,
      command("KEEP_HAND", version, { bottomCardIds: [] }),
    )
    expect(missingSelection).toMatchObject({
      type: "ERROR",
      error: { code: "INVALID_COMMAND" },
    })

    const snapshot = await runtime.snapshot(session)
    const selectedCardIds =
      snapshot.privateView?.hand.slice(0, 2).map(card => card.instanceId) ?? []
    expect(selectedCardIds).toHaveLength(2)
    expectAccepted(
      await runtime.command(
        session,
        command("KEEP_HAND", version, {
          bottomCardIds: selectedCardIds,
        }),
      ),
      version + 1,
    )
    const kept = await runtime.snapshot(session)
    expect(kept.privateView?.hand).toHaveLength(5)
    expect(kept.players["seat-a"]?.libraryCount).toBe(25)
  })

  test("voert de zeven basiscommands authoritative en versioned uit", async () => {
    const session = playerSession(0)
    const readyVersion = await keepAllOpeningHands()
    const socketAcknowledgement = await runtime.socketCommand(
      playerSockets[0]!,
      command("DRAW_CARD", readyVersion, { amount: 1 }),
    )
    if (!socketAcknowledgement) throw new Error("Socketack ontbreekt.")
    expectAccepted(socketAcknowledgement, readyVersion + 1)
    let snapshot = await runtime.snapshot(session)
    expect(snapshot.privateView?.hand).toHaveLength(8)

    const handCard = snapshot.privateView?.hand[0]
    expect(handCard).toBeDefined()
    expectAccepted(
      await runtime.command(
        session,
        command("MOVE_CARD", readyVersion + 1, {
          instanceId: handCard?.instanceId,
          zone: "battlefield",
          position: { x: 0.5, y: 0.5, z: 1 },
        }),
      ),
      readyVersion + 2,
    )
    expectAccepted(
      await runtime.command(
        session,
        command("CHANGE_LIFE", readyVersion + 2, { delta: -3 }),
      ),
      readyVersion + 3,
    )
    expectAccepted(
      await runtime.command(
        session,
        command("CHANGE_POISON", readyVersion + 3, { delta: 2 }),
      ),
      readyVersion + 4,
    )
    expectAccepted(
      await runtime.command(
        session,
        command("MILL", readyVersion + 4, { amount: 2 }),
      ),
      readyVersion + 5,
    )
    expectAccepted(
      await runtime.command(
        session,
        command("SHUFFLE_LIBRARY", readyVersion + 5, {}),
      ),
      readyVersion + 6,
    )
    const activeBeforeTurn = (await runtime.snapshot(session)).activePlayerId
    const activeIndex = playerIds.findIndex(
      playerId => playerId === activeBeforeTurn,
    )
    const activeSession = playerSession(activeIndex)
    const nextPlayerId = playerIds[(activeIndex + 1) % playerIds.length]!
    expectAccepted(
      await runtime.command(
        activeSession,
        command("NEXT_PHASE", readyVersion + 6, {}),
      ),
      readyVersion + 7,
    )
    expectAccepted(
      await runtime.command(
        session,
        command("SET_MONARCH", readyVersion + 7, { playerId: "seat-b" }),
      ),
      readyVersion + 8,
    )
    expectAccepted(
      await runtime.command(
        session,
        command("SET_INITIATIVE", readyVersion + 8, {
          playerId: "seat-a",
        }),
      ),
      readyVersion + 9,
    )
    expectAccepted(
      await runtime.command(
        session,
        command("SET_DAY_NIGHT", readyVersion + 9, { status: "night" }),
      ),
      readyVersion + 10,
    )
    expectAccepted(
      await runtime.command(
        activeSession,
        command("PASS_TURN", readyVersion + 10, {}),
      ),
      readyVersion + 11,
    )

    snapshot = await runtime.snapshot(session)
    expect(snapshot.version).toBe(readyVersion + 11)
    expect(snapshot.players["seat-a"]).toMatchObject({
      life: 37,
      poison: 2,
    })
    expect(snapshot.players["seat-a"]?.battlefield).toHaveLength(1)
    expect(snapshot.players["seat-a"]?.graveyard).toHaveLength(2)
    expect(snapshot.activePlayerId).toBe(nextPlayerId)
    expect(snapshot.phase).toBe("beginning")
    expect(snapshot.matchStatus).toEqual({
      monarchPlayerId: "seat-b",
      initiativePlayerId: "seat-a",
      dayNight: "night",
    })

    const nextPlayer = await runtime.snapshot(
      playerSession(playerIds.indexOf(nextPlayerId)),
    )
    expect(nextPlayer.privateView?.hand).toHaveLength(8)
  })

  test("broadcast iedere mutation realtime, bidirectioneel en per ontvanger", async () => {
    let version = await keepAllOpeningHands()
    for (const socket of [...playerSockets, spectatorSocket]) {
      socket.clearMessages()
    }

    const playerAView = await runtime.snapshot(playerSession(0))
    const handCard = playerAView.privateView?.hand[0]
    expect(handCard).toBeDefined()
    await runtime.socketCommand(
      playerSockets[0]!,
      command("MOVE_CARD", version, {
        instanceId: handCard?.instanceId,
        zone: "battlefield",
        position: { x: 0.4, y: 0.5, z: 1 },
      }),
    )
    version += 1

    for (const socket of [...playerSockets, spectatorSocket]) {
      const latest = socket
        .events()
        .filter(event => event.type === "PERSONAL_SNAPSHOT")
        .at(-1)
      expect(latest).toMatchObject({
        type: "PERSONAL_SNAPSHOT",
        version,
        players: {
          "seat-a": {
            battlefield: [
              expect.objectContaining({ instanceId: handCard?.instanceId }),
            ],
          },
        },
      })
    }
    const playerBSnapshot = playerSockets[1]!
      .events()
      .filter(event => event.type === "PERSONAL_SNAPSHOT")
      .at(-1)
    expect(
      playerBSnapshot?.type === "PERSONAL_SNAPSHOT"
        ? playerBSnapshot.privateView?.playerId
        : null,
    ).toBe("seat-b")
    expect(JSON.stringify(playerBSnapshot)).not.toContain("Geheim van seat-c")

    await runtime.socketCommand(
      playerSockets[1]!,
      command("CHANGE_LIFE", version, { delta: -2 }),
    )
    version += 1
    const receivedByA = playerSockets[0]!
      .events()
      .filter(event => event.type === "PERSONAL_SNAPSHOT")
      .at(-1)
    expect(receivedByA).toMatchObject({
      type: "PERSONAL_SNAPSHOT",
      version,
      players: { "seat-b": { life: 38 } },
    })

    const activeId = (await runtime.snapshot(playerSession(0))).activePlayerId
    const activeIndex = playerIds.findIndex(playerId => playerId === activeId)
    await runtime.socketCommand(
      playerSockets[activeIndex]!,
      command("PASS_TURN", version, {}),
    )
    version += 1
    const activeAfter = (await runtime.snapshot(playerSession(0)))
      .activePlayerId
    for (const socket of [...playerSockets, spectatorSocket]) {
      expect(
        socket
          .events()
          .filter(event => event.type === "PERSONAL_SNAPSHOT")
          .at(-1),
      ).toMatchObject({
        type: "PERSONAL_SNAPSHOT",
        version,
        activePlayerId: activeAfter,
      })
    }
  })

  test("een stale socket blokkeert andere realtime ontvangers niet", async () => {
    const version = await keepAllOpeningHands()
    const staleSocket = runtime.connect(playerSession(0))
    staleSocket.throwOnSend = true
    const healthyReconnect = runtime.connect(playerSession(1))

    expectAccepted(
      await runtime.command(
        playerSession(0),
        command("CHANGE_LIFE", version, { delta: -1 }),
      ),
      version + 1,
    )

    expect(staleSocket.closed).toEqual({
      code: 1008,
      reason: "Snapshot delivery failed",
    })
    expect(
      healthyReconnect
        .events()
        .filter(event => event.type === "PERSONAL_SNAPSHOT")
        .at(-1),
    ).toMatchObject({
      type: "PERSONAL_SNAPSHOT",
      version: version + 1,
      players: { "seat-a": { life: 39 } },
    })
  })

  test("reconnect synchroniseert eerst en blijft daarna live ontvangen", async () => {
    let version = await keepAllOpeningHands()
    runtime.disconnect(playerSockets[1]!)

    expectAccepted(
      await runtime.command(
        playerSession(0),
        command("CHANGE_LIFE", version, { delta: -1 }),
      ),
      version + 1,
    )
    version += 1

    const reconnected = await runtime.reconnect(playerSession(1))
    expect(reconnected.events().at(-1)).toMatchObject({
      type: "PERSONAL_SNAPSHOT",
      version,
      players: { "seat-a": { life: 39 } },
    })

    expectAccepted(
      await runtime.command(
        playerSession(0),
        command("CHANGE_LIFE", version, { delta: -1 }),
      ),
      version + 1,
    )
    expect(reconnected.events().at(-1)).toMatchObject({
      type: "PERSONAL_SNAPSHOT",
      version: version + 1,
      players: { "seat-a": { life: 38 } },
    })
  })

  test("synchroniseert commander- en spelertrackers authoritative", async () => {
    const session = playerSession(0)
    let version = await keepAllOpeningHands()
    let snapshot = await runtime.snapshot(session)
    const ownCommander = snapshot.players["seat-a"]?.command[0]?.instanceId
    const opposingCommander = snapshot.players["seat-b"]?.command[0]?.instanceId
    expect(ownCommander).toBeDefined()
    expect(opposingCommander).toBeDefined()

    const apply = async (
      type: Parameters<typeof command>[0],
      payload: unknown,
    ) => {
      expectAccepted(
        await runtime.command(session, command(type, version, payload)),
        version + 1,
      )
      version += 1
    }

    await apply("CHANGE_COMMANDER_TAX", {
      commanderId: ownCommander,
      delta: 2,
    })
    await apply("CHANGE_COMMANDER_DAMAGE", {
      commanderId: opposingCommander,
      delta: 3,
    })
    await apply("SET_TRACKER_VISIBILITY", {
      tracker: "energy",
      visible: true,
    })
    await apply("CHANGE_TRACKER", { tracker: "energy", delta: 4 })
    await apply("SET_CITYS_BLESSING", { active: true })
    await apply("SET_PLAYER_DISABLED", { disabled: true })
    await apply("UNTAP_ALL", {})

    snapshot = await runtime.snapshot(session)
    expect(snapshot.players["seat-a"]).toMatchObject({
      trackers: { energy: 4, experience: 0, rad: 0 },
      visibleTrackers: { energy: true, experience: false, rad: false },
      citysBlessing: true,
      disabled: true,
      commanderTax: { [ownCommander!]: 2 },
      commanderDamage: { [opposingCommander!]: 3 },
    })
  })

  test("onthult librarykaarten uitsluitend in de persoonlijke view", async () => {
    const session = playerSession(0)
    const readyVersion = await keepAllOpeningHands()

    expectAccepted(
      await runtime.command(
        session,
        command("REVEAL_LIBRARY", readyVersion, { amount: 3 }),
      ),
      readyVersion + 1,
    )

    const ownerView = await runtime.snapshot(session)
    const opponentView = await runtime.snapshot(playerSession(1))
    const spectatorView = await runtime.snapshot(spectatorSession)
    expect(ownerView.privateView?.revealedLibraryCards).toHaveLength(3)
    expect(opponentView.privateView?.revealedLibraryCards).toHaveLength(0)
    expect(spectatorView.privateView).toBeNull()
    expect("library" in (opponentView.players["seat-a"] ?? {})).toBe(false)

    expectAccepted(
      await runtime.command(
        session,
        command("HIDE_LIBRARY", readyVersion + 1, {}),
      ),
      readyVersion + 2,
    )
    expect(
      (await runtime.snapshot(session)).privateView?.revealedLibraryCards,
    ).toHaveLength(0)
  })

  test("maakt een decktoken authoritative op de gekozen tafelpositie", async () => {
    const session = playerSession(0)
    const readyVersion = await keepAllOpeningHands()
    const before = await runtime.snapshot(session)
    const token = before.privateView?.availableTokens[0]
    expect(token?.name).toBe("Treasure")

    expectAccepted(
      await runtime.command(
        session,
        command("CREATE_TOKEN", readyVersion, {
          token,
          position: { x: 0.3, y: 0.7, z: 4 },
        }),
      ),
      readyVersion + 1,
    )

    const ownerView = await runtime.snapshot(session)
    const opponentView = await runtime.snapshot(playerSession(1))
    expect(ownerView.players["seat-a"]?.battlefield.at(-1)).toMatchObject({
      name: "Treasure",
      position: { x: 0.3, y: 0.7, z: 4 },
    })
    expect(opponentView.players["seat-a"]?.battlefield.at(-1)).toMatchObject({
      name: "Treasure",
      position: { x: 0.3, y: 0.7, z: 4 },
    })
  })

  test("gebruikt dezelfde kaart-, selectie- en groeptransities authoritative", async () => {
    const session = playerSession(0)
    let version = await keepAllOpeningHands()
    const hand = (await runtime.snapshot(session)).privateView?.hand ?? []
    const first = hand[0]?.instanceId
    const second = hand[1]?.instanceId
    expect(first).toBeDefined()
    expect(second).toBeDefined()

    const apply = async (
      type: Parameters<typeof command>[0],
      payload: unknown,
    ) => {
      expectAccepted(
        await runtime.command(session, command(type, version, payload)),
        version + 1,
      )
      version += 1
    }

    await apply("MOVE_CARDS", {
      moves: [
        {
          instanceId: first,
          zone: "battlefield",
          position: { x: 0.35, y: 0.5, z: 1 },
        },
        {
          instanceId: second,
          zone: "battlefield",
          position: { x: 0.55, y: 0.5, z: 2 },
        },
      ],
    })
    await apply("TOGGLE_TAP", { instanceIds: [first, second] })
    await apply("SET_COUNTER", {
      instanceId: first,
      counter: "+1/+1",
      value: 2,
    })
    await apply("SWITCH_FACE", { instanceId: first })
    await apply("CREATE_GROUP", {
      cardIds: [first, second],
      name: "Gedeelde selectie",
    })

    const owner = await runtime.snapshot(session)
    const opponent = await runtime.snapshot(playerSession(1))
    expect(owner.players["seat-a"]?.battlefield).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instanceId: first,
          tapped: true,
          activeFaceIndex: 1,
          counters: { "+1/+1": 2 },
          name: "Andere zijde van seat-a",
        }),
        expect.objectContaining({ instanceId: second, tapped: true }),
      ]),
    )
    expect(Object.values(owner.groupsById ?? {})).toContainEqual(
      expect.objectContaining({
        playerId: "seat-a",
        cardIds: [first, second],
        name: "Gedeelde selectie",
      }),
    )
    expect(opponent.groupsById).toEqual(owner.groupsById)
  })

  test("weigert rol-, kaart-, game- en playerId-manipulatie", async () => {
    const readyVersion = await keepAllOpeningHands()
    const injectedPlayerId = {
      ...command("CHANGE_LIFE", readyVersion, { delta: -40 }),
      playerId: "seat-b",
    }
    const injected = await runtime.command(playerSession(0), injectedPlayerId)
    expect(injected).toMatchObject({
      type: "ERROR",
      error: { code: "INVALID_COMMAND" },
    })

    const spectator = await runtime.command(
      spectatorSession,
      command("DRAW_CARD", readyVersion, { amount: 1 }),
    )
    expect(spectator).toMatchObject({
      type: "ERROR",
      error: { code: "FORBIDDEN" },
    })

    const missingCard = await runtime.command(
      playerSession(0),
      command("MOVE_CARD", readyVersion, {
        instanceId: "kaart-van-een-ander",
        zone: "battlefield",
      }),
    )
    expect(missingCard).toMatchObject({
      type: "ERROR",
      error: { code: "INVALID_COMMAND" },
    })

    const ownHandCard = (await runtime.snapshot(playerSession(0))).privateView
      ?.hand[0]?.instanceId
    const hiddenZoneFlip = await runtime.command(
      playerSession(0),
      command("SWITCH_FACE", readyVersion, { instanceId: ownHandCard }),
    )
    expect(hiddenZoneFlip).toMatchObject({
      type: "ERROR",
      error: { code: "INVALID_COMMAND" },
    })

    const wrongGame = await runtime.command(
      { ...playerSession(0), gameId: "other-game" },
      command("DRAW_CARD", readyVersion, { amount: 1 }),
    )
    expect(wrongGame).toMatchObject({
      type: "ERROR",
      error: { code: "FORBIDDEN" },
    })

    const snapshot = await runtime.snapshot(playerSession(1))
    expect(snapshot.players["seat-b"]?.life).toBe(40)

    const oversized = await runtime.rawCommand(
      playerSession(0),
      JSON.stringify({
        type: "DRAW_CARD",
        commandId: "00000000-0000-4000-8000-999999999999",
        expectedVersion: readyVersion,
        payload: { amount: 1 },
        padding: "🔥".repeat(8_192),
      }),
    )
    expect(oversized).toMatchObject({
      type: "ERROR",
      error: { code: "INVALID_COMMAND" },
    })
  })

  test("oude versie levert een persoonlijke resyncsnapshot op", async () => {
    const readyVersion = await keepAllOpeningHands()
    expectAccepted(
      await runtime.command(
        playerSession(0),
        command("CHANGE_LIFE", readyVersion, { delta: -1 }),
      ),
      readyVersion + 1,
    )
    const conflict = await runtime.command(
      playerSession(0),
      command("DRAW_CARD", readyVersion, { amount: 1 }),
    )
    expect(conflict).toMatchObject({
      type: "ERROR",
      error: {
        code: "VERSION_CONFLICT",
        currentVersion: readyVersion + 1,
      },
      snapshot: { version: readyVersion + 1 },
    })
    if (conflict.type !== "ERROR") throw new Error("Conflict verwacht.")
    expect(conflict.snapshot?.privateView?.playerId).toBe("seat-a")
    expect(JSON.stringify(conflict.snapshot)).not.toContain("Geheim van seat-b")
  })

  test("reconnectview blijft aan dezelfde geverifieerde seat gekoppeld", async () => {
    const original = await runtime.snapshot(playerSession(0))
    const reconnectSession = { ...playerSession(0) }
    const reconnected = await runtime.snapshot(reconnectSession)
    expect(reconnected.privateView?.playerId).toBe("seat-a")
    expect(reconnected.privateView?.hand).toEqual(original.privateView?.hand)

    const forgedSeat = await runtime.command(
      { ...reconnectSession, playerId: "seat-b" },
      command("CHANGE_LIFE", 0, { delta: -5 }),
    )
    expect(forgedSeat).toMatchObject({
      type: "ERROR",
      error: { code: "FORBIDDEN" },
    })
  })

  test("herstelt authoritative state uit SQLite zonder read-only writes", async () => {
    const readyVersion = await keepAllOpeningHands()
    const writesAfterInitialize = runtime.sql.writeCount
    await runtime.snapshot(playerSession(0))
    expect(runtime.sql.writeCount).toBe(writesAfterInitialize)

    expectAccepted(
      await runtime.command(
        playerSession(0),
        command("CHANGE_LIFE", readyVersion, { delta: -4 }),
      ),
      readyVersion + 1,
    )
    expect(runtime.sql.writeCount).toBe(writesAfterInitialize + 1)

    await runtime.command(
      playerSession(0),
      command("DRAW_CARD", readyVersion, { amount: 1 }),
    )
    expect(runtime.sql.writeCount).toBe(writesAfterInitialize + 1)

    const restarted = new LocalDurableObjectEnvironment(runtime.sql)
    const restored = await restarted.snapshot(playerSession(0))
    expect(restored.version).toBe(readyVersion + 1)
    expect(restored.players["seat-a"]?.life).toBe(36)
    expect(runtime.sql.writeCount).toBe(writesAfterInitialize + 1)
  })
})
