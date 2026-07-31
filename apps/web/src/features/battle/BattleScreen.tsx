import { useAppDispatch, useAppSelector } from "../../app/hooks"
import { AppLink } from "../../app/router"
import { Brand } from "../../components/Brand"
import { StatusBar } from "../../components/StatusBar"
import { redo, undo } from "../game/gameSlice"
import { OfflinePanel } from "../offline/OfflinePanel"
import { setOfflinePanel } from "../offline/offlineSlice"
import { BattleRuntimeProvider } from "./BattleRuntime"
import { BattleExperience } from "./BattleExperience"
import { useOfflineBattleRuntime } from "./useOfflineBattleRuntime"

type BattleScreenProps = {
  onNewBattle: () => void
}

export const BattleScreen = ({ onNewBattle }: BattleScreenProps) => {
  const dispatch = useAppDispatch()
  const runtime = useOfflineBattleRuntime()
  const gameHistory = useAppSelector(state => state.game)
  const restored = useAppSelector(state => state.ui.restored)
  const offline = useAppSelector(state => state.offline.current)

  if (!runtime) return null

  return (
    <BattleRuntimeProvider runtime={runtime}>
      <main className="battle-screen">
        <header className="battle-header">
          <AppLink to="/" className="brand-link">
            <Brand />
          </AppLink>
          <div className="battle-title">
            <span className="eyebrow">
              {restored ? "Lokale battle hervat" : "Actieve battle"}
            </span>
            <strong>{runtime.game.title}</strong>
          </div>
          <StatusBar />
          <nav className="battle-actions" aria-label="Battleacties">
            <button
              className="icon-button"
              type="button"
              disabled={gameHistory.past.length === 0}
              onClick={() => {
                dispatch(undo())
              }}
            >
              ↶ <span>Undo</span>
            </button>
            <button
              className="icon-button"
              type="button"
              disabled={gameHistory.future.length === 0}
              onClick={() => {
                dispatch(redo())
              }}
            >
              ↷ <span>Redo</span>
            </button>
            <button
              className={`button button--offline ${
                offline?.status === "complete" ? "is-complete" : ""
              }`}
              type="button"
              onClick={() => {
                dispatch(setOfflinePanel(true))
              }}
            >
              {offline?.status === "complete"
                ? "✓ Offline beschikbaar"
                : "Download voor offline gebruik"}
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={onNewBattle}
            >
              Nieuwe battle
            </button>
          </nav>
        </header>
        <BattleExperience />
        <OfflinePanel />
      </main>
    </BattleRuntimeProvider>
  )
}
