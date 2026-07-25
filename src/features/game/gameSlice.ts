import { createSlice, current, type PayloadAction } from "@reduxjs/toolkit"
import {
  advancePhase,
  advanceTurn,
  changeCommanderDamage,
  changeCommanderTax,
  changePlayerLife,
  changePlayerPoison,
  createToken,
  drawCards,
  duplicateToken,
  keepOpeningHand,
  millCards,
  moveCard,
  moveCards,
  mulliganOpeningHand,
  seededRandom,
  setCardCounter,
  setCardStackOrder,
  shuffleLibrary,
  switchCardFace,
  toggleCardTapped,
  toggleCardsTapped,
  untapAllCards,
} from "../../game-core/game"
import type {
  BattlefieldPosition,
  GameHistoryState,
  GameState,
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
  addToken,
  changeDamage,
  changeLife,
  changePoison,
  changeStackOrder,
  changeTax,
  closeBattle,
  copyToken,
  drawCard,
  hydrateBattle,
  keepHand,
  mill,
  moveCard: moveGameCard,
  moveCards: moveGameCards,
  mulliganHand,
  nextPhase,
  nextTurn,
  redo,
  setCounter,
  shufflePlayerLibrary,
  startGame,
  switchFace,
  toggleTap,
  toggleSelectedTap,
  undo,
  untapAll,
} = gameSlice.actions
