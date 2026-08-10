import {
  calculateBroadcastCost,
  connectionLimitViolation,
  GAME_BROADCAST_BUDGET_BYTES,
  GAME_COMMAND_LIMIT,
  GAME_COMMAND_WINDOW_MS,
  MAX_GAME_CARD_INSTANCES,
  MAX_SERIALIZED_GAME_STATE_BYTES,
  MAX_SPECTATOR_WEBSOCKETS,
  MemoryBroadcastBudget,
  MemoryCommandRateLimiter,
  personalSnapshotViewKey,
  validateGameRecordLimits,
  validatePersonalSnapshotLimits,
  validateSeedGrowthLimits,
} from "../src/game-security"
import { createAuthoritativeGame } from "../src/game-server-adapter"
import type { StoredGameRecord } from "../src/game-snapshot-store"
import type { GameSession } from "../src/types"

const gameId = "security-game"
const playerSession = (uid: string): GameSession => ({
  gameId,
  uid,
  playerId: `player-${uid}`,
  role: "player",
  isHost: uid === "one",
})
const spectatorSession = (uid: string): GameSession => ({
  gameId,
  uid,
  playerId: null,
  role: "spectator",
  isHost: false,
})

const record = (): StoredGameRecord => ({
  game: createAuthoritativeGame({
    gameId,
    title: "Security test",
    players: ["one", "two"].map(uid => ({
      playerId: `player-${uid}`,
      uid,
      displayName: uid,
      deckSnapshotId: `deck-${uid}`,
      deckName: `Deck ${uid}`,
      cards: [
        {
          definitionId: `card-${uid}`,
          name: `Card ${uid}`,
          quantity: 1,
          isCommander: true,
        },
      ],
      tokens: [],
    })),
  }),
  processedCommands: {},
})

describe("Game Durable Object abuse limits", () => {
  test("staat twee sockets per UID toe en weigert de derde", () => {
    const one = playerSession("one")
    expect(connectionLimitViolation([], one)).toBeNull()
    expect(connectionLimitViolation([one], one)).toBeNull()
    expect(connectionLimitViolation([one, one], one)).toBe(
      "WEBSOCKET_CONNECTION_LIMIT_REACHED",
    )
    expect(
      connectionLimitViolation([one, one], playerSession("two")),
    ).toBeNull()
  })

  test("vrijgekomen of verdwenen sockets gebruiken geen capaciteit", () => {
    const one = playerSession("one")
    const restoredAttachments = [one, one]
    expect(connectionLimitViolation(restoredAttachments, one)).not.toBeNull()
    restoredAttachments.pop()
    expect(connectionLimitViolation(restoredAttachments, one)).toBeNull()
  })

  test("handhaaft twintig spectators zonder spelers mee te tellen", () => {
    const spectators = Array.from(
      { length: MAX_SPECTATOR_WEBSOCKETS },
      (_, index) => spectatorSession(`spectator-${index}`),
    )
    expect(
      connectionLimitViolation(
        [...spectators, playerSession("one"), playerSession("two")],
        spectatorSession("new-spectator"),
      ),
    ).toBe("SPECTATOR_CONNECTION_LIMIT_REACHED")
    expect(
      connectionLimitViolation(spectators, playerSession("three")),
    ).toBeNull()
  })

  test("spectators houden ook hun eigen limiet van twee verbindingen", () => {
    const spectator = spectatorSession("same")
    expect(connectionLimitViolation([spectator, spectator], spectator)).toBe(
      "WEBSOCKET_CONNECTION_LIMIT_REACHED",
    )
  })

  test("gelijktijdige acceptatie kan de afgeleide limiet niet overschrijden", () => {
    const active: GameSession[] = []
    const incoming = playerSession("one")
    const accepted = Array.from({ length: 3 }, () => {
      const violation = connectionLimitViolation(active, incoming)
      if (!violation) active.push(incoming)
      return violation
    })
    expect(accepted).toEqual([null, null, "WEBSOCKET_CONNECTION_LIMIT_REACHED"])
  })

  test("limiteert iedere UID onafhankelijk tot dertig commandpogingen", () => {
    const limiter = new MemoryCommandRateLimiter()
    for (let attempt = 0; attempt < GAME_COMMAND_LIMIT; attempt += 1) {
      expect(limiter.attempt("one", 1_000)).toBe(true)
    }
    expect(limiter.attempt("one", 1_000)).toBe(false)
    expect(limiter.attempt("two", 1_000)).toBe(true)
    expect(limiter.attempt("one", 1_000 + GAME_COMMAND_WINDOW_MS)).toBe(true)
    expect(limiter.size).toBe(1)
  })

  test("accepteert een groot plausibel bord tot de instantielimiet", () => {
    const candidate = record()
    const template = Object.values(candidate.game.cardsById)[0]!
    const player = candidate.game.players[template.controllerId]!
    for (
      let index = Object.keys(candidate.game.cardsById).length;
      index < MAX_GAME_CARD_INSTANCES;
      index += 1
    ) {
      const instanceId = `large-board-token-${index}`
      candidate.game.cardsById[instanceId] = {
        ...template,
        instanceId,
        zone: "battlefield",
        counters: {},
      }
      player.zones.battlefield.push(instanceId)
    }
    expect(validateGameRecordLimits(candidate)).toMatchObject({ valid: true })

    candidate.game.cardsById["one-too-many"] = {
      ...template,
      instanceId: "one-too-many",
      counters: {},
    }
    expect(validateGameRecordLimits(candidate)).toMatchObject({
      valid: false,
      violation: "card-instances",
      actual: MAX_GAME_CARD_INSTANCES + 1,
    })
  })

  test("wijst buitensporige deckhoeveelheden af vóór stateconstructie", () => {
    const oversizedSeed = {
      gameId,
      title: "Oversized",
      players: ["one", "two"].map(uid => ({
        playerId: `player-${uid}`,
        uid,
        displayName: uid,
        deckSnapshotId: `deck-${uid}`,
        deckName: uid,
        cards: Array.from({ length: 13 }, (_, index) => ({
          definitionId: `${uid}-${index}`,
          name: "Card",
          quantity: 100,
          isCommander: index === 0,
        })),
        tokens: [],
      })),
    }
    expect(validateSeedGrowthLimits(oversizedSeed)).toMatchObject({
      violation: "card-instances",
      actual: 2_600,
    })
  })

  test("meet de persistente JSON-representatie exact in UTF-8-bytes", () => {
    const below = record()
    const baseline = new TextEncoder().encode(JSON.stringify(below)).byteLength
    below.game.title = "x".repeat(
      MAX_SERIALIZED_GAME_STATE_BYTES - baseline - 1 + below.game.title.length,
    )
    const accepted = validateGameRecordLimits(below)
    expect(accepted).toMatchObject({
      valid: true,
      byteLength: MAX_SERIALIZED_GAME_STATE_BYTES - 1,
    })

    below.game.title += "xx"
    expect(validateGameRecordLimits(below)).toMatchObject({
      valid: false,
      violation: "serialized-bytes",
      actual: MAX_SERIALIZED_GAME_STATE_BYTES + 1,
    })
  })

  test("begrensd een geëxpandeerde persoonlijke snapshot afzonderlijk", () => {
    const candidate = record()
    const template = Object.values(candidate.game.cardsById)[0]!
    const definition =
      candidate.game.cardDefinitionsById[template.definitionId]!
    definition.faces = Array.from({ length: 4 }, (_, index) => ({
      name: `${index}-${"n".repeat(298)}`,
      typeLine: "t".repeat(500),
    }))
    const player = candidate.game.players[template.controllerId]!
    for (let index = 0; index < 1_500; index += 1) {
      const instanceId = `expanded-view-${index}`
      candidate.game.cardsById[instanceId] = {
        ...template,
        instanceId,
        zone: "battlefield",
        counters: {},
      }
      player.zones.battlefield.push(instanceId)
    }

    expect(validateGameRecordLimits(candidate)).toMatchObject({ valid: true })
    expect(validatePersonalSnapshotLimits(candidate.game)).toMatchObject({
      valid: false,
      violation: "personal-snapshot-bytes",
    })
  })

  test("berekent en begrenst de volledige 32-socket broadcastfan-out", () => {
    const sessions = [
      ...Array.from({ length: 6 }, (_, index) => [
        playerSession(`player-${index}`),
        playerSession(`player-${index}`),
      ]).flat(),
      ...Array.from({ length: MAX_SPECTATOR_WEBSOCKETS }, (_, index) =>
        spectatorSession(`spectator-${index}`),
      ),
    ]
    const views = new Map(
      sessions.map(session => [
        personalSnapshotViewKey(session),
        { serialized: "", byteLength: MAX_SERIALIZED_GAME_STATE_BYTES },
      ]),
    )
    const cost = calculateBroadcastCost(views, sessions)
    expect(sessions).toHaveLength(32)
    expect(cost).toBe(128 * 1024 * 1024)

    const budget = new MemoryBroadcastBudget()
    for (let broadcast = 0; broadcast < 4; broadcast += 1) {
      expect(budget.reserve(cost, 1_000)).toBe(true)
    }
    expect(4 * cost).toBe(GAME_BROADCAST_BUDGET_BYTES)
    expect(budget.reserve(cost, 1_000)).toBe(false)
  })
})
