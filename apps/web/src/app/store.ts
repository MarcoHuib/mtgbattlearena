import type { Action, ThunkAction } from "@reduxjs/toolkit"
import {
  combineSlices,
  configureStore,
  createListenerMiddleware,
  isAnyOf,
} from "@reduxjs/toolkit"
import { gameSlice } from "../features/game/gameSlice"
import {
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
  copyToken,
  createGroup,
  detach,
  dissolveGroup,
  drawCard,
  keepHand,
  mill,
  moveGameCard,
  moveGameCards,
  moveCardInLibrary,
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
} from "../features/game/gameSlice"
import { offlineSlice } from "../features/offline/offlineSlice"
import { onlineSlice } from "../features/online/onlineSlice"
import { setupSlice } from "../features/setup/setupSlice"
import { uiSlice } from "../features/ui/uiSlice"
import { setSaveError, setSaved, setSaving } from "../features/ui/uiSlice"
import type { PersistedGame } from "@mtg/game-core/types"
import { repositories } from "../persistence/database"
import { graphqlApi } from "./api/graphqlApi"
import { setupListeners } from "@reduxjs/toolkit/query"
import { receiveOnlineEvent } from "../features/online/onlineSlice"
import { graphQLTagsForServerEvent } from "./api/realtimeCache"

const rootReducer = combineSlices(
  setupSlice,
  gameSlice,
  offlineSlice,
  onlineSlice,
  uiSlice,
  graphqlApi,
)
export type RootState = ReturnType<typeof rootReducer>

const autosaveListener = createListenerMiddleware()
let autosaveTimer: ReturnType<typeof setTimeout> | undefined

autosaveListener.startListening({
  matcher: isAnyOf(
    startGame,
    addKnownToken,
    addToken,
    copyToken,
    drawCard,
    mill,
    keepHand,
    mulliganHand,
    moveGameCard,
    moveGameCards,
    moveCardInLibrary,
    attach,
    detach,
    createGroup,
    updateGroup,
    moveGroup,
    addToGroup,
    removeFromGroup,
    dissolveGroup,
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
    changeTracker,
    setTrackerVisibility,
    setCitysBlessing,
    setDisabled,
    setMonarch,
    setInitiative,
    setDayNight,
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
      schemaVersion: 7,
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

autosaveListener.startListening({
  actionCreator: receiveOnlineEvent,
  effect: (action, listenerApi) => {
    const previousState = listenerApi.getOriginalState() as RootState
    const tags = graphQLTagsForServerEvent(
      action.payload,
      previousState.online.view !== null,
    )
    if (tags.length) listenerApi.dispatch(graphqlApi.util.invalidateTags(tags))
  },
})

export const makeStore = (preloadedState?: Partial<RootState>) =>
  configureStore({
    reducer: rootReducer,
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware()
        .prepend(autosaveListener.middleware)
        .concat(graphqlApi.middleware),
    preloadedState,
  })

export const store = makeStore()
setupListeners(store.dispatch)
export type AppStore = typeof store
export type AppDispatch = AppStore["dispatch"]
export type AppThunk<ThunkReturnType = void> = ThunkAction<
  ThunkReturnType,
  RootState,
  unknown,
  Action
>
