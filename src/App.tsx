import { useEffect, useRef, useState } from "react"
import { useAppDispatch, useAppSelector } from "./app/hooks"
import { hydrateApplication } from "./app/thunks"
import { UpdatePrompt } from "./components/UpdatePrompt"
import { BattleScreen } from "./features/battle/BattleScreen"
import { closeBattle } from "./features/game/gameSlice"
import { clearSetup } from "./features/setup/setupSlice"
import { showSetup } from "./features/ui/uiSlice"
import { SetupScreen } from "./features/setup/SetupScreen"
import "./App.css"

export const App = () => {
  const dispatch = useAppDispatch()
  const bootStatus = useAppSelector(state => state.ui.bootStatus)
  const screen = useAppSelector(state => state.ui.screen)
  const [confirmNew, setConfirmNew] = useState(false)
  const hydrated = useRef(false)

  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    void dispatch(hydrateApplication())
  }, [dispatch])

  if (bootStatus === "loading") {
    return (
      <main className="boot-screen" aria-live="polite">
        <div className="boot-mark">B</div>
        <p>Lokale tafel herstellen…</p>
      </main>
    )
  }

  const startNew = () => {
    dispatch(closeBattle())
    dispatch(clearSetup())
    dispatch(showSetup())
    setConfirmNew(false)
  }

  return (
    <>
      {screen === "battle" ? (
        <BattleScreen
          onNewBattle={() => {
            setConfirmNew(true)
          }}
        />
      ) : (
        <SetupScreen />
      )}
      {bootStatus === "error" ? (
        <div className="storage-alert" role="alert">
          Lokale opslag kon niet volledig worden geopend.
        </div>
      ) : null}
      {confirmNew ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-new-title"
          >
            <span className="eyebrow">Huidige battle blijft opgeslagen</span>
            <h2 id="confirm-new-title">Een nieuwe battle voorbereiden?</h2>
            <p>
              Je gaat terug naar deckimport. Pas wanneer je een nieuwe battle
              start, wordt die de laatst actieve lokale battle.
            </p>
            <div>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => {
                  setConfirmNew(false)
                }}
              >
                Annuleren
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={startNew}
              >
                Naar deckimport
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <UpdatePrompt />
    </>
  )
}
