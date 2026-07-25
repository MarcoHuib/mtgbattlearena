import { createSlice, current, type PayloadAction } from "@reduxjs/toolkit"
import {
  advanceTurn,
  changePlayerLife,
  drawCards,
  keepOpeningHand,
  moveCard,
  mulliganOpeningHand,
  seededRandom,
  setCardCounter,
  toggleCardTapped,
} from "../../game-core/game"
import type {
  BattlefieldPosition,
  GameHistoryState,
  GameState,
  PlayerId,
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
    toggleTap(state, action: PayloadAction<{ instanceId: string }>) {
      applyGameChange(state, game =>
        toggleCardTapped(game, action.payload.instanceId),
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
  changeLife,
  closeBattle,
  drawCard,
  hydrateBattle,
  keepHand,
  moveCard: moveGameCard,
  mulliganHand,
  nextTurn,
  redo,
  setCounter,
  startGame,
  toggleTap,
  undo,
} = gameSlice.actions
