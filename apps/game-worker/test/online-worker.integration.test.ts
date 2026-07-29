import type { GameCommand, ServerEvent } from "@mtg/game-protocol"
import { parsePersonalSnapshot, parseServerEvent } from "@mtg/game-protocol"
import { GameDurableObject } from "../src/game-durable-object"
import type { OnlineGameSeed } from "../src/game-server-adapter"
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
        imageUrl: `https://cards.example/${playerId}-secret.jpg`,
        scryfallId: `scryfall-secret-${playerId}`,
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

  const keepAllOpeningHands = async (): Promise<number> => {
    let version = 0
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
    const blocked = await runtime.command(
      session,
      command("DRAW_CARD", 0, { amount: 1 }),
    )
    expect(blocked).toMatchObject({
      type: "ERROR",
      error: { code: "NOT_READY" },
    })

    expectAccepted(
      await runtime.command(session, command("MULLIGAN_HAND", 0, {})),
      1,
    )
    let snapshot = await runtime.snapshot(session)
    expect(snapshot.openingHands["seat-a"]).toEqual({
      mulliganCount: 1,
      kept: false,
    })
    expect(snapshot.privateView?.hand).toHaveLength(7)

    expectAccepted(
      await runtime.command(session, command("KEEP_HAND", 1, {})),
      2,
    )
    snapshot = await runtime.snapshot(session)
    expect(snapshot.openingHands["seat-a"]?.kept).toBe(true)
    expect(snapshot.openingHands["seat-b"]?.kept).toBe(false)
  })

  test("voert de zeven basiscommands authoritative en versioned uit", async () => {
    const session = playerSession(0)
    const readyVersion = await keepAllOpeningHands()
    const socketAcknowledgement = await runtime.socketCommand(
      playerSockets[0]!,
      command("DRAW_CARD", readyVersion, { amount: 1 }),
    )
    if (!socketAcknowledgement) throw new Error("Socketack ontbreekt.")
    expectAccepted(socketAcknowledgement, 5)
    let snapshot = await runtime.snapshot(session)
    expect(snapshot.privateView?.hand).toHaveLength(8)

    const handCard = snapshot.privateView?.hand[0]
    expect(handCard).toBeDefined()
    expectAccepted(
      await runtime.command(
        session,
        command("MOVE_CARD", 5, {
          instanceId: handCard?.instanceId,
          zone: "battlefield",
          position: { x: 0.5, y: 0.5, z: 1 },
        }),
      ),
      6,
    )
    expectAccepted(
      await runtime.command(session, command("CHANGE_LIFE", 6, { delta: -3 })),
      7,
    )
    expectAccepted(
      await runtime.command(session, command("CHANGE_POISON", 7, { delta: 2 })),
      8,
    )
    expectAccepted(
      await runtime.command(session, command("MILL", 8, { amount: 2 })),
      9,
    )
    expectAccepted(
      await runtime.command(session, command("SHUFFLE_LIBRARY", 9, {})),
      10,
    )
    expectAccepted(
      await runtime.command(session, command("NEXT_PHASE", 10, {})),
      11,
    )
    expectAccepted(
      await runtime.command(
        session,
        command("SET_MONARCH", 11, { playerId: "seat-b" }),
      ),
      12,
    )
    expectAccepted(
      await runtime.command(
        session,
        command("SET_INITIATIVE", 12, { playerId: "seat-a" }),
      ),
      13,
    )
    expectAccepted(
      await runtime.command(
        session,
        command("SET_DAY_NIGHT", 13, { status: "night" }),
      ),
      14,
    )
    expectAccepted(
      await runtime.command(session, command("PASS_TURN", 14, {})),
      15,
    )

    snapshot = await runtime.snapshot(session)
    expect(snapshot.version).toBe(15)
    expect(snapshot.players["seat-a"]).toMatchObject({
      life: 37,
      poison: 2,
    })
    expect(snapshot.players["seat-a"]?.battlefield).toHaveLength(1)
    expect(snapshot.players["seat-a"]?.graveyard).toHaveLength(2)
    expect(snapshot.activePlayerId).toBe("seat-b")
    expect(snapshot.phase).toBe("beginning")
    expect(snapshot.matchStatus).toEqual({
      monarchPlayerId: "seat-b",
      initiativePlayerId: "seat-a",
      dayNight: "night",
    })

    const playerB = await runtime.snapshot(playerSession(1))
    expect(playerB.privateView?.hand).toHaveLength(8)
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
      5,
    )
    const conflict = await runtime.command(
      playerSession(0),
      command("DRAW_CARD", readyVersion, { amount: 1 }),
    )
    expect(conflict).toMatchObject({
      type: "ERROR",
      error: { code: "VERSION_CONFLICT", currentVersion: 5 },
      snapshot: { version: 5 },
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
      5,
    )
    expect(runtime.sql.writeCount).toBe(writesAfterInitialize + 1)

    await runtime.command(
      playerSession(0),
      command("DRAW_CARD", readyVersion, { amount: 1 }),
    )
    expect(runtime.sql.writeCount).toBe(writesAfterInitialize + 1)

    const restarted = new LocalDurableObjectEnvironment(runtime.sql)
    const restored = await restarted.snapshot(playerSession(0))
    expect(restored.version).toBe(5)
    expect(restored.players["seat-a"]?.life).toBe(36)
    expect(runtime.sql.writeCount).toBe(writesAfterInitialize + 1)
  })
})
