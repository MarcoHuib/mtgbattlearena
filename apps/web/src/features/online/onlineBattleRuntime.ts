import { useMemo, useState } from "react"
import type {
  CardDefinition,
  CardInstance,
  GameState,
  PlayerId,
  PlayerState,
  Zone,
} from "@mtg/game-core/types"
import type {
  GameCommand,
  OnlineTokenDefinition,
  PersonalGameSnapshot,
  VisibleOnlineCard,
} from "@mtg/game-protocol"
import type {
  BattleRuntime,
  BattleRuntimeActions,
} from "../battle/BattleRuntime"

type SendCommand = (type: GameCommand["type"], payload: unknown) => void

const zones: Zone[] = [
  "library",
  "hand",
  "battlefield",
  "graveyard",
  "exile",
  "command",
]

const tokenDefinition = (token: OnlineTokenDefinition): CardDefinition => ({
  id: token.definitionId,
  name: token.name,
  typeLine: token.typeLine,
  faces: [
    {
      name: token.name,
      typeLine: token.typeLine,
    },
  ],
  imageRefs: token.imageRef ? [token.imageRef] : [],
  token: {
    source: "deck",
    kind: token.kind,
    name: token.name,
    power: token.power,
    toughness: token.toughness,
  },
})

const visibleDefinition = (card: VisibleOnlineCard): CardDefinition => {
  const faces =
    card.faces ??
    Array.from({ length: Math.max(1, card.activeFaceIndex + 1) }, () => ({
      name: card.name,
      typeLine: card.typeLine,
      imageRef: card.imageRef,
    }))
  return {
    id: card.definitionId,
    name: card.name,
    typeLine: card.typeLine,
    faces,
    imageRefs: faces.flatMap(face => face.imageRef ? [face.imageRef] : []),
  }
}

const visibleInstance = (
  card: VisibleOnlineCard,
  playerId: PlayerId,
  zone: Zone,
): CardInstance => ({
  instanceId: card.instanceId,
  definitionId: card.definitionId,
  ownerId: playerId,
  controllerId: playerId,
  zone,
  tapped: card.tapped,
  faceDown: false,
  activeFaceIndex: card.activeFaceIndex,
  counters: card.counters,
  position: card.position,
  isCommander: card.isCommander,
  attachedTo: card.attachedTo,
})

export const onlineSnapshotToGameState = (
  snapshot: PersonalGameSnapshot,
  fallbackTokens: OnlineTokenDefinition[] = [],
): GameState => {
  const cardsById: Record<string, CardInstance> = {}
  const cardDefinitionsById: Record<string, CardDefinition> = {}
  const players: Record<PlayerId, PlayerState> = {}
  const ownPlayerId = snapshot.privateView?.playerId

  for (const playerId of snapshot.turnOrder) {
    const publicPlayer = snapshot.players[playerId]
    if (!publicPlayer) continue
    const cardsByZone: Partial<Record<Zone, VisibleOnlineCard[]>> = {
      hand: playerId === ownPlayerId ? (snapshot.privateView?.hand ?? []) : [],
      battlefield: publicPlayer.battlefield,
      graveyard: publicPlayer.graveyard,
      exile: publicPlayer.exile,
      command: publicPlayer.command,
      library:
        playerId === ownPlayerId
          ? (snapshot.privateView?.revealedLibraryCards ?? [])
          : [],
    }
    const playerZones = Object.fromEntries(
      zones.map(zone => {
        const cards = cardsByZone[zone] ?? []
        for (const card of cards) {
          cardsById[card.instanceId] = visibleInstance(card, playerId, zone)
          cardDefinitionsById[card.definitionId] = visibleDefinition(card)
        }
        return [zone, cards.map(card => card.instanceId)]
      }),
    ) as PlayerState["zones"]
    players[playerId] = {
      id: playerId,
      name: publicPlayer.displayName,
      deckSnapshotId:
        playerId === ownPlayerId
          ? (snapshot.privateView?.deckSnapshotId ?? "")
          : "",
      life: publicPlayer.life,
      poison: publicPlayer.poison,
      trackers: publicPlayer.trackers,
      visibleTrackers: publicPlayer.visibleTrackers,
      citysBlessing: publicPlayer.citysBlessing,
      disabled: publicPlayer.disabled,
      commanderTax: publicPlayer.commanderTax,
      commanderDamage: publicPlayer.commanderDamage,
      zones: playerZones,
    }
  }

  const availableTokens = snapshot.privateView?.availableTokens.length
    ? snapshot.privateView.availableTokens
    : fallbackTokens
  for (const token of availableTokens) {
    const normalizedToken =
      ownPlayerId &&
      !token.definitionId.startsWith(`${ownPlayerId}:`) &&
      !snapshot.privateView?.availableTokens.length
        ? {
            ...token,
            definitionId: `${ownPlayerId}:${token.definitionId}`,
          }
        : token
    cardDefinitionsById[normalizedToken.definitionId] =
      tokenDefinition(normalizedToken)
  }

  return {
    schemaVersion: 7,
    id: snapshot.gameId,
    title: snapshot.turnOrder
      .map(playerId => snapshot.players[playerId]?.displayName)
      .filter(Boolean)
      .join(" vs. "),
    createdAt: "",
    updatedAt: "",
    activePlayerId: snapshot.activePlayerId,
    turnNumber: snapshot.turnNumber,
    phase: snapshot.phase,
    matchStatus: snapshot.matchStatus,
    firstPlayerRoll: snapshot.firstPlayerRoll,
    openingHands: snapshot.openingHands,
    deckSnapshotIds: ["", ""],
    players,
    cardDefinitionsById,
    cardsById,
    groupsById: snapshot.groupsById ?? {},
  }
}

export const useOnlineBattleRuntime = (
  snapshot: PersonalGameSnapshot | null,
  pending: boolean,
  sendCommand: SendCommand,
  fallbackTokens: OnlineTokenDefinition[] = [],
): BattleRuntime | null => {
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([])

  return useMemo(() => {
    if (!snapshot) return null
    const game = onlineSnapshotToGameState(snapshot, fallbackTokens)
    const viewerPlayerId = snapshot.privateView?.playerId ?? null
    const own = (playerId: PlayerId) => playerId === viewerPlayerId
    const actions: BattleRuntimeActions = {
      rollForFirstPlayer: playerId => {
        if (own(playerId)) sendCommand("ROLL_FOR_FIRST_PLAYER", {})
      },
      rollAllForFirstPlayer: () => undefined,
      completeFirstPlayerRoll: () => {
        sendCommand("COMPLETE_FIRST_PLAYER_ROLL", {})
      },
      moveCards: moves => {
        const ownMoves = moves
          .filter(move => own(move.playerId))
          .map(({ instanceId, zone, position }) => ({
            instanceId,
            zone,
            position,
          }))
        if (ownMoves.length === 1) {
          sendCommand("MOVE_CARD", ownMoves[0])
        } else if (ownMoves.length > 1) {
          sendCommand("MOVE_CARDS", { moves: ownMoves })
        }
      },
      moveCardInLibrary: (instanceId, playerId, position) => {
        if (own(playerId)) {
          sendCommand("MOVE_CARD_IN_LIBRARY", { instanceId, position })
        }
      },
      toggleTap: instanceId => {
        sendCommand("TOGGLE_TAP", { instanceId })
      },
      toggleSelectedTap: instanceIds => {
        sendCommand("TOGGLE_TAP", { instanceIds })
      },
      setCounter: (instanceId, counter, value) => {
        sendCommand("SET_COUNTER", { instanceId, counter, value })
      },
      switchFace: instanceId => {
        sendCommand("SWITCH_FACE", { instanceId })
      },
      changeStackOrder: (instanceId, direction) => {
        sendCommand("SET_STACK_ORDER", { instanceId, direction })
      },
      attach: (attachmentId, targetId) => {
        sendCommand("ATTACH_CARD", { attachmentId, targetId })
      },
      detach: attachmentId => {
        sendCommand("DETACH_CARD", { attachmentId })
      },
      duplicateToken: instanceId => {
        sendCommand("DUPLICATE_TOKEN", { instanceId })
      },
      createGroup: (_playerId, cardIds, name) => {
        sendCommand("CREATE_GROUP", { cardIds, name })
      },
      addToGroup: (groupId, cardIds) => {
        sendCommand("ADD_TO_GROUP", { groupId, cardIds })
      },
      removeFromGroup: (groupId, cardIds) => {
        sendCommand("REMOVE_FROM_GROUP", { groupId, cardIds })
      },
      updateGroup: (groupId, changes) => {
        sendCommand("UPDATE_GROUP", { groupId, ...changes })
      },
      moveGroup: (groupId, position) => {
        sendCommand("MOVE_GROUP", { groupId, position })
      },
      dissolveGroup: groupId => {
        sendCommand("DISSOLVE_GROUP", { groupId })
      },
      drawCards: (playerId, amount) => {
        if (own(playerId)) sendCommand("DRAW_CARD", { amount })
      },
      millCards: (playerId, amount) => {
        if (own(playerId)) sendCommand("MILL", { amount })
      },
      shuffleLibrary: playerId => {
        if (own(playerId)) sendCommand("SHUFFLE_LIBRARY", {})
      },
      revealLibrary: (playerId, amount) => {
        if (own(playerId)) sendCommand("REVEAL_LIBRARY", { amount })
      },
      hideLibrary: playerId => {
        if (own(playerId)) sendCommand("HIDE_LIBRARY", {})
      },
      mulligan: playerId => {
        if (own(playerId)) sendCommand("MULLIGAN_HAND", {})
      },
      keepHand: (playerId, bottomCardIds) => {
        if (own(playerId)) sendCommand("KEEP_HAND", { bottomCardIds })
      },
      untapAll: playerId => {
        if (own(playerId)) sendCommand("UNTAP_ALL", {})
      },
      createToken: (playerId, definition, position) => {
        if (!own(playerId) || !definition.token || !position) return
        sendCommand("CREATE_TOKEN", {
          token: {
            definitionId: definition.id,
            name: definition.name,
            typeLine: definition.typeLine,
            imageRef: definition.imageRefs[0],
            kind: definition.token.kind,
            power: definition.token.power,
            toughness: definition.token.toughness,
          },
          position,
        })
      },
      changeLife: (playerId, delta) => {
        if (own(playerId)) sendCommand("CHANGE_LIFE", { delta })
      },
      changePoison: (playerId, delta) => {
        if (own(playerId)) sendCommand("CHANGE_POISON", { delta })
      },
      changeTracker: (playerId, tracker, delta) => {
        if (own(playerId)) sendCommand("CHANGE_TRACKER", { tracker, delta })
      },
      setTrackerVisibility: (playerId, tracker, visible) => {
        if (own(playerId)) {
          sendCommand("SET_TRACKER_VISIBILITY", { tracker, visible })
        }
      },
      setCitysBlessing: (playerId, active) => {
        if (own(playerId)) sendCommand("SET_CITYS_BLESSING", { active })
      },
      setDisabled: (playerId, disabled) => {
        if (own(playerId)) sendCommand("SET_PLAYER_DISABLED", { disabled })
      },
      changeCommanderTax: (playerId, commanderId, delta) => {
        if (own(playerId)) {
          sendCommand("CHANGE_COMMANDER_TAX", { commanderId, delta })
        }
      },
      changeCommanderDamage: (playerId, commanderId, delta) => {
        if (own(playerId)) {
          sendCommand("CHANGE_COMMANDER_DAMAGE", { commanderId, delta })
        }
      },
      setMonarch: playerId => {
        sendCommand("SET_MONARCH", { playerId })
      },
      setInitiative: playerId => {
        sendCommand("SET_INITIATIVE", { playerId })
      },
      setDayNight: status => {
        sendCommand("SET_DAY_NIGHT", { status })
      },
      nextPhase: () => {
        sendCommand("NEXT_PHASE", {})
      },
      nextTurn: () => {
        sendCommand("PASS_TURN", {})
      },
    }
    return {
      mode: "online",
      game,
      viewerPlayerId,
      controllablePlayerIds:
        snapshot.role === "player" && viewerPlayerId
          ? new Set([viewerPlayerId])
          : new Set<PlayerId>(),
      hiddenZoneCounts: Object.fromEntries(
        snapshot.turnOrder.map(playerId => [
          playerId,
          {
            hand: snapshot.players[playerId]?.handCount ?? 0,
            library: snapshot.players[playerId]?.libraryCount ?? 0,
          },
        ]),
      ),
      selectedCardIds,
      setSelectedCardIds,
      pending,
      firstPlayerRollFlow: "individual",
      canCompleteFirstPlayerRoll: snapshot.isHost,
      actions,
    }
  }, [fallbackTokens, pending, selectedCardIds, sendCommand, snapshot])
}
