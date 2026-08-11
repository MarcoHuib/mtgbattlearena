import {
  gameCommandSchema,
  parsePersonalSnapshot,
  type GameCommand,
  type PersonalGameSnapshot,
  type ServerEvent,
  type VisibleOnlineCard,
} from "@mtg/game-protocol"
import {
  createFirstPlayerRollState,
  resolveFirstPlayerRoll,
} from "@mtg/game-core/game"
import type { OnlineConnectionUpdate, OnlineGameConnection } from "./types"

const card = (
  name: string,
  index: number,
  playerId = "mock-player-1",
): VisibleOnlineCard => {
  const imageId = "6a9c39e4-a8cf-42dd-8d0e-45634b335546"
  const frontImage = { resolver: 1, imageId, faceIndex: 0, variant: "normal" as const }
  const backImage = { resolver: 1, imageId, faceIndex: 1, variant: "normal" as const }
  return {
    instanceId: `${playerId}-card-${index}`,
    definitionId: `${playerId}-definition-${index}`,
    name,
    imageRef: frontImage,
    typeLine: "Creature — Demo",
    tapped: false,
    activeFaceIndex: 0,
    counters: {},
    faces:
      index === 1
        ? [
            { name, typeLine: "Creature — Demo", imageRef: frontImage },
            {
              name: `${name} achterkant`,
              typeLine: "Artifact — Demo",
              imageRef: backImage,
            },
          ]
        : undefined,
    isCommander: false,
  }
}

const initialSnapshot = (
  gameId: string,
  viewerPlayerId = "mock-player-1",
): PersonalGameSnapshot => {
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
        trackers: { energy: 0, experience: 0, rad: 0 },
        visibleTrackers: { energy: false, experience: false, rad: false },
        citysBlessing: false,
        disabled: false,
        commanderTax: {},
        commanderDamage: {},
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
    isHost: viewerPlayerId === turnOrder[0],
    activePlayerId: turnOrder[0],
    turnNumber: 1,
    phase: "beginning",
    matchStatus: {
      monarchPlayerId: null,
      initiativePlayerId: null,
      dayNight: "none",
    },
    firstPlayerRoll: createFirstPlayerRollState(turnOrder),
    turnOrder,
    openingHands: Object.fromEntries(
      turnOrder.map((playerId, index) => [
        playerId,
        { mulliganCount: 0, kept: index !== 0 },
      ]),
    ),
    players,
    privateView: {
      playerId: viewerPlayerId,
      deckSnapshotId: `mock-deck-${viewerPlayerId}`,
      hand: Array.from({ length: 7 }, (_, index) =>
        card(`Demo kaart ${index + 1}`, index + 1, viewerPlayerId),
      ),
      revealedLibraryCards: [],
      availableTokens: [
        {
          definitionId: "mock-token-treasure",
          name: "Treasure",
          typeLine: "Token Artifact — Treasure",
          kind: "treasure",
        },
      ],
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
  private readonly sourceId = crypto.randomUUID()
  private readonly channel: BroadcastChannel | null

  constructor(gameId: string, viewerPlayerId = "mock-player-1") {
    this.snapshot = initialSnapshot(gameId, viewerPlayerId)
    this.channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(`mtg-online-mock-${gameId}`)
    if (this.channel) {
      this.channel.onmessage = event => {
        const message = event.data as {
          sourceId?: string
          snapshot?: unknown
        }
        if (message.sourceId === this.sourceId || !message.snapshot) return
        try {
          const incoming = parsePersonalSnapshot(message.snapshot)
          if (
            incoming.gameId !== this.snapshot.gameId ||
            incoming.version <= this.snapshot.version
          ) {
            return
          }
          this.snapshot = parsePersonalSnapshot({
            ...incoming,
            role: this.snapshot.role,
            isHost: this.snapshot.isHost,
            privateView: this.snapshot.privateView,
          })
          this.emit({
            type: "event",
            event: structuredClone(this.snapshot),
          })
        } catch {
          this.emit({
            type: "status",
            status: "error",
            message: "De mockserver stuurde een ongeldig realtimebericht.",
          })
        }
      }
    }
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
    this.channel?.close()
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
    const next = structuredClone(this.snapshot)
    const ownId = next.privateView?.playerId
    if (!ownId || !next.privateView) return
    const own = next.players[ownId]
    if (!own) return
    const publicZones = [own.battlefield, own.graveyard, own.exile, own.command]
    const findVisibleCard = (instanceId: string) =>
      next.privateView?.hand.find(item => item.instanceId === instanceId) ??
      publicZones.flat().find(item => item.instanceId === instanceId)
    const moveVisibleCard = (
      instanceId: string,
      zone:
        "library" | "hand" | "battlefield" | "graveyard" | "exile" | "command",
      position?: { x: number; y: number; z: number },
    ) => {
      const moving = findVisibleCard(instanceId)
      if (!moving || !next.privateView) return false
      next.privateView.hand = next.privateView.hand.filter(
        item => item.instanceId !== moving.instanceId,
      )
      for (const publicZone of publicZones) {
        const index = publicZone.findIndex(
          item => item.instanceId === moving.instanceId,
        )
        if (index >= 0) publicZone.splice(index, 1)
      }
      if (zone === "hand") {
        next.privateView.hand.push(moving)
      } else if (zone !== "library") {
        own[zone].push({ ...moving, position })
      } else {
        own.libraryCount += 1
      }
      own.handCount = next.privateView.hand.length
      return true
    }

    switch (command.type) {
      case "ROLL_FOR_FIRST_PLAYER": {
        let rollState = resolveFirstPlayerRoll(next.firstPlayerRoll, ownId, 20)
        while (rollState.status === "rolling" || rollState.status === "tie") {
          const simulatedPlayerId = rollState.eligiblePlayerIds.find(
            playerId =>
              playerId !== ownId && rollState.rolls[playerId] === undefined,
          )
          if (!simulatedPlayerId) break
          rollState = resolveFirstPlayerRoll(
            rollState,
            simulatedPlayerId,
            Math.max(1, 19 - rollState.rollSequence),
          )
        }
        next.firstPlayerRoll = rollState as typeof next.firstPlayerRoll
        if (rollState.winnerPlayerId) {
          next.activePlayerId = rollState.winnerPlayerId
        }
        break
      }
      case "COMPLETE_FIRST_PLAYER_ROLL":
        if (next.firstPlayerRoll.status !== "winner_determined") return
        next.firstPlayerRoll.status = "completed"
        break
      case "MULLIGAN_HAND": {
        const openingHand = next.openingHands[ownId]
        if (!openingHand || openingHand.kept) return
        openingHand.mulliganCount += 1
        next.privateView.hand = Array.from({ length: 7 }, (_, index) =>
          card(
            `Nieuwe demo ${this.nextCardIndex + index}`,
            this.nextCardIndex + index,
            ownId,
          ),
        )
        this.nextCardIndex += 7
        own.handCount = 7
        own.libraryCount = 92
        break
      }
      case "KEEP_HAND": {
        const openingHand = next.openingHands[ownId]
        if (!openingHand || openingHand.kept) return
        const selected = new Set(command.payload.bottomCardIds)
        if (
          selected.size !==
            Math.max(0, Math.min(6, openingHand.mulliganCount - 1)) ||
          command.payload.bottomCardIds.some(
            instanceId =>
              !next.privateView?.hand.some(
                item => item.instanceId === instanceId,
              ),
          )
        ) {
          return
        }
        next.privateView.hand = next.privateView.hand.filter(
          item => !selected.has(item.instanceId),
        )
        own.handCount = next.privateView.hand.length
        own.libraryCount += selected.size
        openingHand.kept = true
        break
      }
      case "DRAW_CARD": {
        const amount = Math.min(command.payload.amount, own.libraryCount)
        for (let count = 0; count < amount; count += 1) {
          next.privateView.hand.push(
            card(
              `Getrokken demo ${this.nextCardIndex}`,
              this.nextCardIndex,
              ownId,
            ),
          )
          this.nextCardIndex += 1
        }
        own.libraryCount -= amount
        own.handCount = next.privateView.hand.length
        break
      }
      case "MOVE_CARD": {
        if (
          !moveVisibleCard(
            command.payload.instanceId,
            command.payload.zone,
            command.payload.position,
          )
        ) {
          return
        }
        break
      }
      case "MOVE_CARDS": {
        for (const move of command.payload.moves) {
          if (!moveVisibleCard(move.instanceId, move.zone, move.position)) {
            return
          }
        }
        break
      }
      case "MOVE_CARD_IN_LIBRARY": {
        const cards = next.privateView.revealedLibraryCards
        const index = cards.findIndex(
          item => item.instanceId === command.payload.instanceId,
        )
        const [moving] = index >= 0 ? cards.splice(index, 1) : []
        if (!moving) return
        if (command.payload.position === "top") cards.push(moving)
        else cards.unshift(moving)
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
            card(
              `Gemilde demo ${this.nextCardIndex}`,
              this.nextCardIndex,
              ownId,
            ),
          )
          this.nextCardIndex += 1
        }
        break
      }
      case "SHUFFLE_LIBRARY":
        break
      case "REVEAL_LIBRARY":
        next.privateView.revealedLibraryCards = Array.from(
          {
            length: Math.min(command.payload.amount, own.libraryCount),
          },
          (_, index) =>
            card(
              `Library demo ${this.nextCardIndex + index}`,
              this.nextCardIndex + index,
              ownId,
            ),
        )
        break
      case "HIDE_LIBRARY":
        next.privateView.revealedLibraryCards = []
        break
      case "UNTAP_ALL":
        own.battlefield.forEach(item => {
          item.tapped = false
        })
        break
      case "CREATE_TOKEN":
        own.battlefield.push({
          instanceId: `mock-token-${this.nextCardIndex}`,
          definitionId: command.payload.token.definitionId,
          name: command.payload.token.name,
          typeLine: command.payload.token.typeLine,
          imageRef: command.payload.token.imageRef,
          tapped: false,
          activeFaceIndex: 0,
          counters: {},
          position: command.payload.position,
          isCommander: false,
        })
        this.nextCardIndex += 1
        break
      case "CHANGE_TRACKER":
        own.trackers[command.payload.tracker] = Math.max(
          0,
          own.trackers[command.payload.tracker] + command.payload.delta,
        )
        break
      case "SET_TRACKER_VISIBILITY":
        own.visibleTrackers[command.payload.tracker] = command.payload.visible
        break
      case "SET_CITYS_BLESSING":
        own.citysBlessing = command.payload.active
        break
      case "SET_PLAYER_DISABLED":
        own.disabled = command.payload.disabled
        break
      case "CHANGE_COMMANDER_TAX":
        own.commanderTax[command.payload.commanderId] = Math.max(
          0,
          (own.commanderTax[command.payload.commanderId] ?? 0) +
            command.payload.delta,
        )
        break
      case "CHANGE_COMMANDER_DAMAGE":
        own.commanderDamage[command.payload.commanderId] = Math.max(
          0,
          (own.commanderDamage[command.payload.commanderId] ?? 0) +
            command.payload.delta,
        )
        break
      case "PASS_TURN": {
        if (next.activePlayerId !== ownId) return
        const currentIndex = next.turnOrder.indexOf(ownId)
        next.activePlayerId =
          next.turnOrder[(currentIndex + 1) % next.turnOrder.length] ?? ownId
        next.turnNumber += 1
        next.phase = "beginning"
        break
      }
      case "NEXT_PHASE": {
        if (next.activePlayerId !== ownId) return
        const phases: PersonalGameSnapshot["phase"][] = [
          "beginning",
          "precombat-main",
          "combat",
          "postcombat-main",
          "ending",
        ]
        const phaseIndex = phases.indexOf(next.phase)
        if (phaseIndex === phases.length - 1) {
          const currentIndex = next.turnOrder.indexOf(ownId)
          next.activePlayerId =
            next.turnOrder[(currentIndex + 1) % next.turnOrder.length] ?? ownId
          next.turnNumber += 1
          next.phase = "beginning"
        } else {
          next.phase = phases[phaseIndex + 1] ?? "beginning"
        }
        break
      }
      case "SET_MONARCH":
        next.matchStatus.monarchPlayerId = command.payload.playerId
        break
      case "SET_INITIATIVE":
        next.matchStatus.initiativePlayerId = command.payload.playerId
        break
      case "SET_DAY_NIGHT":
        next.matchStatus.dayNight = command.payload.status
        break
      case "TOGGLE_TAP": {
        const instanceIds =
          "instanceIds" in command.payload
            ? command.payload.instanceIds
            : [command.payload.instanceId]
        for (const instanceId of instanceIds) {
          const battlefieldCard = own.battlefield.find(
            item => item.instanceId === instanceId,
          )
          if (!battlefieldCard) return
          battlefieldCard.tapped = !battlefieldCard.tapped
        }
        break
      }
      case "SET_COUNTER": {
        const visibleCard = findVisibleCard(command.payload.instanceId)
        if (!visibleCard) return
        if (command.payload.value === 0) {
          visibleCard.counters = Object.fromEntries(
            Object.entries(visibleCard.counters).filter(
              ([counter]) => counter !== command.payload.counter,
            ),
          )
        } else {
          visibleCard.counters[command.payload.counter] = command.payload.value
        }
        break
      }
      case "SWITCH_FACE": {
        const visibleCard = own.battlefield.find(
          item => item.instanceId === command.payload.instanceId,
        )
        if (!visibleCard || visibleCard.faces?.length !== 2) return
        visibleCard.activeFaceIndex =
          (visibleCard.activeFaceIndex + 1) % visibleCard.faces.length
        const activeFace = visibleCard.faces[visibleCard.activeFaceIndex]
        if (activeFace) {
          visibleCard.name = activeFace.name
          visibleCard.typeLine = activeFace.typeLine
          visibleCard.imageRef = activeFace.imageRef
        }
        break
      }
      case "SET_STACK_ORDER": {
        const visibleCard = own.battlefield.find(
          item => item.instanceId === command.payload.instanceId,
        )
        if (!visibleCard) return
        const levels = own.battlefield.map(item => item.position?.z ?? 0)
        visibleCard.position = {
          x: visibleCard.position?.x ?? 0.5,
          y: visibleCard.position?.y ?? 0.5,
          z:
            command.payload.direction === "front"
              ? Math.max(0, ...levels) + 1
              : Math.max(0, Math.min(...levels) - 1),
        }
        break
      }
      case "ATTACH_CARD": {
        const attachment = own.battlefield.find(
          item => item.instanceId === command.payload.attachmentId,
        )
        const target = own.battlefield.find(
          item => item.instanceId === command.payload.targetId,
        )
        if (!attachment || !target) return
        attachment.attachedTo = target.instanceId
        break
      }
      case "DETACH_CARD": {
        const attachment = own.battlefield.find(
          item => item.instanceId === command.payload.attachmentId,
        )
        if (!attachment) return
        delete attachment.attachedTo
        break
      }
      case "DUPLICATE_TOKEN": {
        const source = own.battlefield.find(
          item => item.instanceId === command.payload.instanceId,
        )
        if (!source) return
        own.battlefield.push({
          ...structuredClone(source),
          instanceId: `mock-token-${this.nextCardIndex}`,
          position: source.position
            ? { ...source.position, x: Math.min(1, source.position.x + 0.05) }
            : undefined,
        })
        this.nextCardIndex += 1
        break
      }
      case "CREATE_GROUP": {
        next.groupsById ??= {}
        const groupId = `mock-group-${this.nextCardIndex}`
        next.groupsById[groupId] = {
          id: groupId,
          playerId: ownId,
          cardIds: command.payload.cardIds,
          name: command.payload.name,
          collapsed: false,
          position: { x: 0.5, y: 0.5, z: 1 },
        }
        this.nextCardIndex += 1
        break
      }
      case "ADD_TO_GROUP": {
        const group = next.groupsById?.[command.payload.groupId]
        if (!group) return
        group.cardIds = [
          ...new Set([...group.cardIds, ...command.payload.cardIds]),
        ]
        break
      }
      case "REMOVE_FROM_GROUP": {
        const group = next.groupsById?.[command.payload.groupId]
        if (!group) return
        group.cardIds = group.cardIds.filter(
          instanceId => !command.payload.cardIds.includes(instanceId),
        )
        break
      }
      case "UPDATE_GROUP": {
        const group = next.groupsById?.[command.payload.groupId]
        if (!group) return
        if (command.payload.name !== undefined) {
          group.name = command.payload.name
        }
        if (command.payload.collapsed !== undefined) {
          group.collapsed = command.payload.collapsed
        }
        break
      }
      case "MOVE_GROUP": {
        const group = next.groupsById?.[command.payload.groupId]
        if (!group) return
        group.cardIds.forEach((instanceId, index) => {
          const groupedCard = own.battlefield.find(
            item => item.instanceId === instanceId,
          )
          if (groupedCard) {
            groupedCard.position = {
              ...command.payload.position,
              x: Math.min(1, command.payload.position.x + index * 0.03),
              z: command.payload.position.z + index,
            }
          }
        })
        break
      }
      case "DISSOLVE_GROUP":
        if (!next.groupsById?.[command.payload.groupId]) return
        next.groupsById = Object.fromEntries(
          Object.entries(next.groupsById).filter(
            ([groupId]) => groupId !== command.payload.groupId,
          ),
        )
        break
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
    this.channel?.postMessage({
      sourceId: this.sourceId,
      snapshot: this.snapshot,
    })
  }

  private emit(update: OnlineConnectionUpdate) {
    for (const listener of this.listeners) listener(update)
  }
}
