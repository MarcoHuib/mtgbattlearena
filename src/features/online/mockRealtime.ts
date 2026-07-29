import {
  gameCommandSchema,
  parsePersonalSnapshot,
  type GameCommand,
  type PersonalGameSnapshot,
  type ServerEvent,
  type VisibleOnlineCard,
} from "../../game-protocol"
import type { OnlineConnectionUpdate, OnlineGameConnection } from "./types"

const card = (name: string, index: number): VisibleOnlineCard => ({
  instanceId: `mock-own-card-${index}`,
  definitionId: `mock-own-definition-${index}`,
  name,
  typeLine: "Creature — Demo",
  tapped: false,
  activeFaceIndex: 0,
  counters: {},
  isCommander: false,
})

const initialSnapshot = (gameId: string): PersonalGameSnapshot => {
  const turnOrder = [
    "mock-player-1",
    "mock-player-2",
    "mock-player-3",
    "mock-player-4",
  ]
  const players = Object.fromEntries(
    turnOrder.map((playerId, index) => [
      playerId,
      {
        id: playerId,
        displayName: index === 0 ? "Jij" : `Tegenstander ${index}`,
        life: 40,
        poison: 0,
        handCount: 7,
        libraryCount: 92,
        battlefield: [],
        graveyard: [],
        exile: [],
        command: [],
      },
    ]),
  )
  return parsePersonalSnapshot({
    type: "PERSONAL_SNAPSHOT",
    mode: "online",
    gameId,
    version: 0,
    role: "player",
    activePlayerId: turnOrder[0],
    turnNumber: 1,
    turnOrder,
    players,
    privateView: {
      playerId: turnOrder[0],
      hand: Array.from({ length: 7 }, (_, index) =>
        card(`Demo kaart ${index + 1}`, index + 1),
      ),
      revealedLibraryCards: [],
    },
  })
}

export class MockRealtimeConnection implements OnlineGameConnection {
  private readonly listeners = new Set<
    (update: OnlineConnectionUpdate) => void
  >()
  private snapshot: PersonalGameSnapshot
  private closed = false
  private started = false
  private nextCardIndex = 8

  constructor(gameId: string) {
    this.snapshot = initialSnapshot(gameId)
  }

  subscribe(listener: (update: OnlineConnectionUpdate) => void) {
    this.listeners.add(listener)
    if (!this.started) {
      this.started = true
      queueMicrotask(() => {
        this.emit({ type: "status", status: "connected" })
        this.emit({ type: "event", event: structuredClone(this.snapshot) })
      })
    }
    return () => {
      this.listeners.delete(listener)
    }
  }

  send(input: GameCommand) {
    if (this.closed) throw new Error("De mockverbinding is gesloten.")
    const command = gameCommandSchema.parse(input)
    queueMicrotask(() => {
      this.apply(command)
    })
  }

  reconnect() {
    this.closed = false
    this.emit({ type: "status", status: "reconnecting" })
    queueMicrotask(() => {
      this.emit({ type: "status", status: "connected" })
      this.emit({ type: "event", event: structuredClone(this.snapshot) })
    })
  }

  close() {
    this.closed = true
    this.emit({ type: "status", status: "disconnected" })
  }

  private apply(command: GameCommand) {
    if (command.expectedVersion !== this.snapshot.version) {
      this.emit({
        type: "event",
        event: {
          type: "ERROR",
          gameId: this.snapshot.gameId,
          commandId: command.commandId,
          error: {
            code: "VERSION_CONFLICT",
            message:
              "De mockclient liep achter en is opnieuw gesynchroniseerd.",
            retryable: true,
            currentVersion: this.snapshot.version,
          },
          snapshot: structuredClone(this.snapshot),
        },
      })
      return
    }
    if (command.type === "TOGGLE_TAP" || command.type === "NEXT_PHASE") {
      this.emit({
        type: "event",
        event: {
          type: "ERROR",
          gameId: this.snapshot.gameId,
          commandId: command.commandId,
          error: {
            code: "NOT_READY",
            message: `${command.type} is nog niet geïmplementeerd.`,
            retryable: true,
            currentVersion: this.snapshot.version,
          },
        },
      })
      return
    }
    const next = structuredClone(this.snapshot)
    const ownId = next.privateView?.playerId
    if (!ownId || !next.privateView) return
    const own = next.players[ownId]
    if (!own) return

    switch (command.type) {
      case "DRAW_CARD": {
        const amount = Math.min(command.payload.amount, own.libraryCount)
        for (let count = 0; count < amount; count += 1) {
          next.privateView.hand.push(
            card(`Getrokken demo ${this.nextCardIndex}`, this.nextCardIndex),
          )
          this.nextCardIndex += 1
        }
        own.libraryCount -= amount
        own.handCount = next.privateView.hand.length
        break
      }
      case "MOVE_CARD": {
        const fromHand = next.privateView.hand.find(
          item => item.instanceId === command.payload.instanceId,
        )
        const publicZones = [
          own.battlefield,
          own.graveyard,
          own.exile,
          own.command,
        ]
        const fromPublic = publicZones
          .flat()
          .find(item => item.instanceId === command.payload.instanceId)
        const moving = fromHand ?? fromPublic
        if (!moving) return
        next.privateView.hand = next.privateView.hand.filter(
          item => item.instanceId !== moving.instanceId,
        )
        for (const zone of publicZones) {
          const index = zone.findIndex(
            item => item.instanceId === moving.instanceId,
          )
          if (index >= 0) zone.splice(index, 1)
        }
        if (command.payload.zone === "hand") {
          next.privateView.hand.push(moving)
        } else if (command.payload.zone !== "library") {
          own[command.payload.zone].push({
            ...moving,
            position: command.payload.position,
          })
        } else {
          own.libraryCount += 1
        }
        own.handCount = next.privateView.hand.length
        break
      }
      case "CHANGE_LIFE":
        own.life += command.payload.delta
        break
      case "CHANGE_POISON":
        own.poison = Math.max(0, own.poison + command.payload.delta)
        break
      case "MILL": {
        const amount = Math.min(command.payload.amount, own.libraryCount)
        own.libraryCount -= amount
        for (let count = 0; count < amount; count += 1) {
          own.graveyard.push(
            card(`Gemilde demo ${this.nextCardIndex}`, this.nextCardIndex),
          )
          this.nextCardIndex += 1
        }
        break
      }
      case "SHUFFLE_LIBRARY":
        break
      case "PASS_TURN": {
        if (next.activePlayerId !== ownId) return
        const currentIndex = next.turnOrder.indexOf(ownId)
        next.activePlayerId =
          next.turnOrder[(currentIndex + 1) % next.turnOrder.length] ?? ownId
        next.turnNumber += 1
        break
      }
    }
    next.version += 1
    this.snapshot = parsePersonalSnapshot(next)
    const acknowledgement: ServerEvent = {
      type: "COMMAND_ACCEPTED",
      gameId: next.gameId,
      commandId: command.commandId,
      version: next.version,
    }
    this.emit({ type: "event", event: acknowledgement })
    this.emit({ type: "event", event: structuredClone(this.snapshot) })
  }

  private emit(update: OnlineConnectionUpdate) {
    for (const listener of this.listeners) listener(update)
  }
}
