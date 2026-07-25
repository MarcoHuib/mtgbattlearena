import type { Action, ThunkAction } from "@reduxjs/toolkit"
import {
  combineSlices,
  configureStore,
  createListenerMiddleware,
  isAnyOf,
} from "@reduxjs/toolkit"
import { gameSlice } from "../features/game/gameSlice"
import {
  addToken,
  changeDamage,
  changeLife,
  changePoison,
  changeStackOrder,
  changeTax,
  copyToken,
  drawCard,
  keepHand,
  mill,
  moveGameCard,
  moveGameCards,
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
} from "../features/game/gameSlice"
import { offlineSlice } from "../features/offline/offlineSlice"
import { setupSlice } from "../features/setup/setupSlice"
import { uiSlice } from "../features/ui/uiSlice"
import { setSaveError, setSaved, setSaving } from "../features/ui/uiSlice"
import type { PersistedGame } from "../game-core/types"
import { repositories } from "../persistence/database"

const rootReducer = combineSlices(setupSlice, gameSlice, offlineSlice, uiSlice)
export type RootState = ReturnType<typeof rootReducer>

const autosaveListener = createListenerMiddleware()
let autosaveTimer: ReturnType<typeof setTimeout> | undefined

autosaveListener.startListening({
  matcher: isAnyOf(
    startGame,
    addToken,
    copyToken,
    drawCard,
    mill,
    keepHand,
    mulliganHand,
    moveGameCard,
    moveGameCards,
    toggleTap,
    toggleSelectedTap,
    setCounter,
    switchFace,
    changeStackOrder,
    shufflePlayerLibrary,
    untapAll,
    nextPhase,
    nextTurn,
    changeLife,
    changePoison,
    changeTax,
    changeDamage,
    undo,
    redo,
  ),
  effect: async (_action, listenerApi) => {
    listenerApi.dispatch(setSaving())
    if (autosaveTimer) clearTimeout(autosaveTimer)
    await new Promise<void>(resolve => {
      autosaveTimer = setTimeout(resolve, 250)
    })
    const state = listenerApi.getState() as RootState
    if (!state.game.present) return
    const savedAt = new Date().toISOString()
    const record: PersistedGame = {
      schemaVersion: 4,
      game: state.game.present,
      past: state.game.past,
      future: state.game.future,
      savedAt,
    }
    try {
      await repositories.games.save(record)
      listenerApi.dispatch(setSaved(savedAt))
    } catch {
      listenerApi.dispatch(
        setSaveError(
          "Automatisch opslaan mislukte. Laat dit tabblad open en probeer opnieuw.",
        ),
      )
    }
  },
})

export const makeStore = (preloadedState?: Partial<RootState>) =>
  configureStore({
    reducer: rootReducer,
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware().prepend(autosaveListener.middleware),
    preloadedState,
  })

export const store = makeStore()
export type AppStore = typeof store
export type AppDispatch = AppStore["dispatch"]
export type AppThunk<ThunkReturnType = void> = ThunkAction<
  ThunkReturnType,
  RootState,
  unknown,
  Action
>
