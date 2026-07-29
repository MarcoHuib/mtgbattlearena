import type { GameCommand, ServerEvent } from "./game-protocol"
import { parsePersonalSnapshot, parseServerEvent } from "./game-protocol"
import { GameDurableObject } from "../worker/online/game-durable-object"
import type { OnlineGameSeed } from "../worker/online/game-server-adapter"
import type {
  DurableObjectState,
  Env,
  GameSession,
  SqlStorage,
  SqlStorageCursor,
  SqlStorageValue,
  WorkerWebSocket,
} from "../worker/online/types"

class LocalSocket implements WorkerWebSocket {
  readonly messages: string[] = []
  closed: { code?: number; reason?: string } | null = null
  private attachment: unknown

  constructor(session: GameSession) {
    this.attachment = session
  }

  send(message: string) {
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

  constructor(readonly sql = new LocalGameSqlStorage()) {
    const state: DurableObjectState = {
      storage: {
        sql,
        transactionSync: callback => callback(),
      },
      blockConcurrencyWhile: callback => callback(),
      acceptWebSocket: socket => {
        this.sockets.push(socket as LocalSocket)
      },
      getWebSockets: () => this.sockets,
    }
    this.durableObject = new GameDurableObject(state, {} as Env)
  }

  connect(session: GameSession) {
    const socket = new LocalSocket(session)
    this.sockets.push(socket)
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
        imageUrl: `https://cards.example/${playerId}-secret.jpg`,
        scryfallId: `scryfall-secret-${playerId}`,
        quantity: 30,
        isCommander: false,
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

  test("serialiseert per verbinding zonder verborgen tegenstanderdata", async () => {
    const playerA = await runtime.snapshot(playerSession(0))
    const playerB = await runtime.snapshot(playerSession(1))
    const spectator = await runtime.snapshot(spectatorSession)

    expect(playerA.turnOrder).toHaveLength(4)
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

  test("voert de zeven basiscommands authoritative en versioned uit", async () => {
    const session = playerSession(0)
    const socketAcknowledgement = await runtime.socketCommand(
      playerSockets[0]!,
      command("DRAW_CARD", 0, { amount: 1 }),
    )
    if (!socketAcknowledgement) throw new Error("Socketack ontbreekt.")
    expectAccepted(socketAcknowledgement, 1)
    let snapshot = await runtime.snapshot(session)
    expect(snapshot.privateView?.hand).toHaveLength(8)

    const handCard = snapshot.privateView?.hand[0]
    expect(handCard).toBeDefined()
    expectAccepted(
      await runtime.command(
        session,
        command("MOVE_CARD", 1, {
          instanceId: handCard?.instanceId,
          zone: "battlefield",
          position: { x: 0.5, y: 0.5, z: 1 },
        }),
      ),
      2,
    )
    expectAccepted(
      await runtime.command(session, command("CHANGE_LIFE", 2, { delta: -3 })),
      3,
    )
    expectAccepted(
      await runtime.command(session, command("CHANGE_POISON", 3, { delta: 2 })),
      4,
    )
    expectAccepted(
      await runtime.command(session, command("MILL", 4, { amount: 2 })),
      5,
    )
    expectAccepted(
      await runtime.command(session, command("SHUFFLE_LIBRARY", 5, {})),
      6,
    )
    expectAccepted(
      await runtime.command(session, command("PASS_TURN", 6, {})),
      7,
    )

    snapshot = await runtime.snapshot(session)
    expect(snapshot.version).toBe(7)
    expect(snapshot.players["seat-a"]).toMatchObject({
      life: 37,
      poison: 2,
    })
    expect(snapshot.players["seat-a"]?.battlefield).toHaveLength(1)
    expect(snapshot.players["seat-a"]?.graveyard).toHaveLength(2)
    expect(snapshot.activePlayerId).toBe("seat-b")

    const playerB = await runtime.snapshot(playerSession(1))
    expect(playerB.privateView?.hand).toHaveLength(8)
  })

  test("weigert rol-, kaart-, game- en playerId-manipulatie", async () => {
    const injectedPlayerId = {
      ...command("CHANGE_LIFE", 0, { delta: -40 }),
      playerId: "seat-b",
    }
    const injected = await runtime.command(playerSession(0), injectedPlayerId)
    expect(injected).toMatchObject({
      type: "ERROR",
      error: { code: "INVALID_COMMAND" },
    })

    const spectator = await runtime.command(
      spectatorSession,
      command("DRAW_CARD", 0, { amount: 1 }),
    )
    expect(spectator).toMatchObject({
      type: "ERROR",
      error: { code: "FORBIDDEN" },
    })

    const missingCard = await runtime.command(
      playerSession(0),
      command("MOVE_CARD", 0, {
        instanceId: "kaart-van-een-ander",
        zone: "battlefield",
      }),
    )
    expect(missingCard).toMatchObject({
      type: "ERROR",
      error: { code: "INVALID_COMMAND" },
    })

    const wrongGame = await runtime.command(
      { ...playerSession(0), gameId: "other-game" },
      command("DRAW_CARD", 0, { amount: 1 }),
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
        expectedVersion: 0,
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
    expectAccepted(
      await runtime.command(
        playerSession(0),
        command("CHANGE_LIFE", 0, { delta: -1 }),
      ),
      1,
    )
    const conflict = await runtime.command(
      playerSession(0),
      command("DRAW_CARD", 0, { amount: 1 }),
    )
    expect(conflict).toMatchObject({
      type: "ERROR",
      error: { code: "VERSION_CONFLICT", currentVersion: 1 },
      snapshot: { version: 1 },
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
    const writesAfterInitialize = runtime.sql.writeCount
    await runtime.snapshot(playerSession(0))
    expect(runtime.sql.writeCount).toBe(writesAfterInitialize)

    expectAccepted(
      await runtime.command(
        playerSession(0),
        command("CHANGE_LIFE", 0, { delta: -4 }),
      ),
      1,
    )
    expect(runtime.sql.writeCount).toBe(writesAfterInitialize + 1)

    await runtime.command(
      playerSession(0),
      command("DRAW_CARD", 0, { amount: 1 }),
    )
    expect(runtime.sql.writeCount).toBe(writesAfterInitialize + 1)

    const restarted = new LocalDurableObjectEnvironment(runtime.sql)
    const restored = await restarted.snapshot(playerSession(0))
    expect(restored.version).toBe(1)
    expect(restored.players["seat-a"]?.life).toBe(36)
    expect(runtime.sql.writeCount).toBe(writesAfterInitialize + 1)
  })
})
