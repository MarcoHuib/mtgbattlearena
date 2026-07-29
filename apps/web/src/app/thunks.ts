import type { AppThunk } from "./store"
import { createGame } from "@mtg/game-core/game"
import { hydratePersistedGame } from "@mtg/game-core/migrations"
import { repositories } from "../persistence/database"
import { hydrateBattle, startGame } from "../features/game/gameSlice"
import { setOfflinePackage } from "../features/offline/offlineSlice"
import { setBootStatus, setSaveError, showBattle } from "../features/ui/uiSlice"

export const hydrateApplication =
  (): AppThunk<Promise<void>> => async dispatch => {
    try {
      const stored = await repositories.games.getLatest()
      if (stored) {
        const persisted = hydratePersistedGame(stored)
        dispatch(
          hydrateBattle({
            present: persisted.game,
            past: persisted.past,
            future: persisted.future,
          }),
        )
        dispatch(
          setOfflinePackage(
            await repositories.offlinePackages.getForGame(persisted.game.id),
          ),
        )
        dispatch(showBattle({ restored: true }))
      }
      dispatch(setBootStatus("ready"))
    } catch {
      dispatch(setBootStatus("error"))
      dispatch(
        setSaveError(
          "De lokale opslag kon niet worden geopend. De app blijft bruikbaar, maar herstel is niet gegarandeerd.",
        ),
      )
    }
  }

export const startBattleFromSetup = (): AppThunk => (dispatch, getState) => {
  const first = getState().setup["player-1"].deck
  const second = getState().setup["player-2"].deck
  if (!first || !second) return
  const game = createGame([first, second], {
    random: Math.random,
    createId: prefix => `${prefix}-${crypto.randomUUID()}`,
    now: new Date().toISOString(),
  })
  dispatch(startGame(game))
  dispatch(setOfflinePackage(null))
  dispatch(showBattle({ restored: false }))
}
