import { createSlice, current, type PayloadAction } from "@reduxjs/toolkit"
import {
  addCardsToGroup,
  advancePhase,
  advanceTurn,
  attachCard,
  changeCommanderDamage,
  changeCommanderTax,
  changePlayerLife,
  changePlayerPoison,
  changePlayerTracker,
  createCardGroup,
  createKnownToken,
  createToken,
  detachCard,
  dissolveCardGroup,
  drawCards,
  duplicateToken,
  keepOpeningHand,
  millCards,
  moveCard,
  moveCardGroup,
  moveCardToLibraryPosition,
  moveCards,
  mulliganOpeningHand,
  removeCardsFromGroup,
  seededRandom,
  setDayNightStatus,
  setCardCounter,
  setCardStackOrder,
  setInitiativeHolder,
  setMonarchHolder,
  setPlayerCitysBlessing,
  setPlayerDisabled,
  setPlayerTrackerVisibility,
  shuffleLibrary,
  switchCardFace,
  toggleCardTapped,
  toggleCardsTapped,
  untapAllCards,
  updateCardGroup,
} from "../../game-core/game"
import type {
  BattlefieldPosition,
  GameHistoryState,
  GameState,
  DayNightStatus,
  OptionalPlayerTracker,
  PlayerId,
  TokenKind,
  Zone,
} from "../../game-core/types"

const initialState: GameHistoryState = {
  present: null,
  past: [],
  future: [],
}

const HISTORY_LIMIT = 30

const applyGameChange = (
  state: GameHistoryState,
  change: (game: GameState) => GameState,
) => {
  if (!state.present) return
  const present = current(state.present)
  const next = change(present)
  if (next === present) return
  state.past.push(present)
  if (state.past.length > HISTORY_LIMIT) state.past.shift()
  state.present = next
  state.future = []
}

export const gameSlice = createSlice({
  name: "game",
  initialState,
  reducers: {
    startGame(_state, action: PayloadAction<GameState>) {
      return { present: action.payload, past: [], future: [] }
    },
    hydrateBattle(_state, action: PayloadAction<GameHistoryState>) {
      return action.payload
    },
    closeBattle() {
      return initialState
    },
    drawCard(
      state,
      action: PayloadAction<{ playerId: PlayerId; amount?: number }>,
    ) {
      applyGameChange(state, game =>
        drawCards(game, action.payload.playerId, action.payload.amount ?? 1),
      )
    },
    moveCard(
      state,
      action: PayloadAction<{
        instanceId: string
        playerId: PlayerId
        zone: Zone
        position?: BattlefieldPosition
      }>,
    ) {
      applyGameChange(state, game =>
        moveCard(
          game,
          action.payload.instanceId,
          action.payload.playerId,
          action.payload.zone,
          action.payload.position,
        ),
      )
    },
    moveCards(
      state,
      action: PayloadAction<{
        moves: {
          instanceId: string
          playerId: PlayerId
          zone: Zone
          position?: BattlefieldPosition
        }[]
      }>,
    ) {
      applyGameChange(state, game => moveCards(game, action.payload.moves))
    },
    moveCardInLibrary(
      state,
      action: PayloadAction<{
        instanceId: string
        playerId: PlayerId
        position: "top" | "bottom"
      }>,
    ) {
      applyGameChange(state, game =>
        moveCardToLibraryPosition(
          game,
          action.payload.instanceId,
          action.payload.playerId,
          action.payload.position,
        ),
      )
    },
    attach(
      state,
      action: PayloadAction<{ attachmentId: string; targetId: string }>,
    ) {
      applyGameChange(state, game =>
        attachCard(game, action.payload.attachmentId, action.payload.targetId),
      )
    },
    detach(state, action: PayloadAction<{ attachmentId: string }>) {
      applyGameChange(state, game =>
        detachCard(game, action.payload.attachmentId),
      )
    },
    createGroup(
      state,
      action: PayloadAction<{
        groupId: string
        playerId: PlayerId
        cardIds: string[]
        name?: string
      }>,
    ) {
      applyGameChange(state, game => createCardGroup(game, action.payload))
    },
    updateGroup(
      state,
      action: PayloadAction<{
        groupId: string
        name?: string
        collapsed?: boolean
      }>,
    ) {
      applyGameChange(state, game =>
        updateCardGroup(game, action.payload.groupId, action.payload),
      )
    },
    moveGroup(
      state,
      action: PayloadAction<{
        groupId: string
        position: BattlefieldPosition
      }>,
    ) {
      applyGameChange(state, game =>
        moveCardGroup(game, action.payload.groupId, action.payload.position),
      )
    },
    addToGroup(
      state,
      action: PayloadAction<{ groupId: string; cardIds: string[] }>,
    ) {
      applyGameChange(state, game =>
        addCardsToGroup(game, action.payload.groupId, action.payload.cardIds),
      )
    },
    removeFromGroup(
      state,
      action: PayloadAction<{ groupId: string; cardIds: string[] }>,
    ) {
      applyGameChange(state, game =>
        removeCardsFromGroup(
          game,
          action.payload.groupId,
          action.payload.cardIds,
        ),
      )
    },
    dissolveGroup(state, action: PayloadAction<{ groupId: string }>) {
      applyGameChange(state, game =>
        dissolveCardGroup(game, action.payload.groupId),
      )
    },
    toggleTap(state, action: PayloadAction<{ instanceId: string }>) {
      applyGameChange(state, game =>
        toggleCardTapped(game, action.payload.instanceId),
      )
    },
    toggleSelectedTap(state, action: PayloadAction<{ instanceIds: string[] }>) {
      applyGameChange(state, game =>
        toggleCardsTapped(game, action.payload.instanceIds),
      )
    },
    setCounter(
      state,
      action: PayloadAction<{
        instanceId: string
        counter: string
        value: number
      }>,
    ) {
      applyGameChange(state, game =>
        setCardCounter(
          game,
          action.payload.instanceId,
          action.payload.counter,
          action.payload.value,
        ),
      )
    },
    switchFace(state, action: PayloadAction<{ instanceId: string }>) {
      applyGameChange(state, game =>
        switchCardFace(game, action.payload.instanceId),
      )
    },
    changeStackOrder(
      state,
      action: PayloadAction<{
        instanceId: string
        direction: "front" | "back"
      }>,
    ) {
      applyGameChange(state, game =>
        setCardStackOrder(
          game,
          action.payload.instanceId,
          action.payload.direction,
        ),
      )
    },
    mill(state, action: PayloadAction<{ playerId: PlayerId; amount: number }>) {
      applyGameChange(state, game =>
        millCards(game, action.payload.playerId, action.payload.amount),
      )
    },
    shufflePlayerLibrary(
      state,
      action: PayloadAction<{ playerId: PlayerId; seed: number }>,
    ) {
      applyGameChange(state, game =>
        shuffleLibrary(
          game,
          action.payload.playerId,
          seededRandom(action.payload.seed),
        ),
      )
    },
    untapAll(state, action: PayloadAction<{ playerId: PlayerId }>) {
      applyGameChange(state, game =>
        untapAllCards(game, action.payload.playerId),
      )
    },
    nextPhase(state) {
      applyGameChange(state, game => advancePhase(game))
    },
    nextTurn(state) {
      applyGameChange(state, game => advanceTurn(game))
    },
    keepHand(state, action: PayloadAction<{ playerId: PlayerId }>) {
      applyGameChange(state, game =>
        keepOpeningHand(game, action.payload.playerId),
      )
    },
    mulliganHand(
      state,
      action: PayloadAction<{ playerId: PlayerId; seed: number }>,
    ) {
      applyGameChange(state, game =>
        mulliganOpeningHand(
          game,
          action.payload.playerId,
          seededRandom(action.payload.seed),
        ),
      )
    },
    changeLife(
      state,
      action: PayloadAction<{ playerId: PlayerId; delta: number }>,
    ) {
      applyGameChange(state, game =>
        changePlayerLife(game, action.payload.playerId, action.payload.delta),
      )
    },
    changePoison(
      state,
      action: PayloadAction<{ playerId: PlayerId; delta: number }>,
    ) {
      applyGameChange(state, game =>
        changePlayerPoison(game, action.payload.playerId, action.payload.delta),
      )
    },
    changeTracker(
      state,
      action: PayloadAction<{
        playerId: PlayerId
        tracker: OptionalPlayerTracker
        delta: number
      }>,
    ) {
      applyGameChange(state, game =>
        changePlayerTracker(
          game,
          action.payload.playerId,
          action.payload.tracker,
          action.payload.delta,
        ),
      )
    },
    setTrackerVisibility(
      state,
      action: PayloadAction<{
        playerId: PlayerId
        tracker: OptionalPlayerTracker
        visible: boolean
      }>,
    ) {
      applyGameChange(state, game =>
        setPlayerTrackerVisibility(
          game,
          action.payload.playerId,
          action.payload.tracker,
          action.payload.visible,
        ),
      )
    },
    setCitysBlessing(
      state,
      action: PayloadAction<{ playerId: PlayerId; active: boolean }>,
    ) {
      applyGameChange(state, game =>
        setPlayerCitysBlessing(
          game,
          action.payload.playerId,
          action.payload.active,
        ),
      )
    },
    setDisabled(
      state,
      action: PayloadAction<{ playerId: PlayerId; disabled: boolean }>,
    ) {
      applyGameChange(state, game =>
        setPlayerDisabled(
          game,
          action.payload.playerId,
          action.payload.disabled,
        ),
      )
    },
    setMonarch(state, action: PayloadAction<{ playerId: PlayerId | null }>) {
      applyGameChange(state, game =>
        setMonarchHolder(game, action.payload.playerId),
      )
    },
    setInitiative(state, action: PayloadAction<{ playerId: PlayerId | null }>) {
      applyGameChange(state, game =>
        setInitiativeHolder(game, action.payload.playerId),
      )
    },
    setDayNight(state, action: PayloadAction<{ status: DayNightStatus }>) {
      applyGameChange(state, game =>
        setDayNightStatus(game, action.payload.status),
      )
    },
    changeTax(
      state,
      action: PayloadAction<{
        playerId: PlayerId
        commanderId: string
        delta: number
      }>,
    ) {
      applyGameChange(state, game =>
        changeCommanderTax(
          game,
          action.payload.playerId,
          action.payload.commanderId,
          action.payload.delta,
        ),
      )
    },
    changeDamage(
      state,
      action: PayloadAction<{
        damagedPlayerId: PlayerId
        commanderId: string
        delta: number
      }>,
    ) {
      applyGameChange(state, game =>
        changeCommanderDamage(
          game,
          action.payload.damagedPlayerId,
          action.payload.commanderId,
          action.payload.delta,
        ),
      )
    },
    addToken(
      state,
      action: PayloadAction<{
        playerId: PlayerId
        kind: TokenKind
        name: string
        power?: number
        toughness?: number
        position?: BattlefieldPosition
        definitionId: string
        instanceId: string
      }>,
    ) {
      let idIndex = 0
      const ids = [action.payload.definitionId, action.payload.instanceId]
      applyGameChange(state, game =>
        createToken(game, {
          ...action.payload,
          createId: () => ids[idIndex++] ?? action.payload.instanceId,
        }),
      )
    },
    addKnownToken(
      state,
      action: PayloadAction<{
        playerId: PlayerId
        definitionId: string
        instanceId: string
        position?: BattlefieldPosition
      }>,
    ) {
      applyGameChange(state, game => createKnownToken(game, action.payload))
    },
    copyToken(
      state,
      action: PayloadAction<{ instanceId: string; duplicateId: string }>,
    ) {
      applyGameChange(state, game =>
        duplicateToken(
          game,
          action.payload.instanceId,
          () => action.payload.duplicateId,
        ),
      )
    },
    undo(state) {
      const previous = state.past.pop()
      if (!previous || !state.present) return
      state.future.unshift(state.present)
      state.present = previous
    },
    redo(state) {
      const next = state.future.shift()
      if (!next || !state.present) return
      state.past.push(state.present)
      state.present = next
    },
  },
})

export const {
  addKnownToken,
  addToGroup,
  addToken,
  attach,
  changeDamage,
  changeLife,
  changePoison,
  changeTracker,
  changeStackOrder,
  changeTax,
  closeBattle,
  copyToken,
  createGroup,
  detach,
  dissolveGroup,
  drawCard,
  hydrateBattle,
  keepHand,
  mill,
  moveCard: moveGameCard,
  moveCardInLibrary,
  moveCards: moveGameCards,
  moveGroup,
  mulliganHand,
  nextPhase,
  nextTurn,
  redo,
  removeFromGroup,
  setCounter,
  setCitysBlessing,
  setDayNight,
  setDisabled,
  setInitiative,
  setMonarch,
  setTrackerVisibility,
  shufflePlayerLibrary,
  startGame,
  switchFace,
  toggleTap,
  toggleSelectedTap,
  undo,
  untapAll,
  updateGroup,
} = gameSlice.actions
