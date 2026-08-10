import { useEffect, useRef, useState } from "react"
import { useAppDispatch, useAppSelector } from "./app/hooks"
import { navigate, useAppRoute } from "./app/router"
import { hydrateApplication } from "./app/thunks"
import { UpdatePrompt } from "./components/UpdatePrompt"
import { AnalyticsConsent } from "./components/AnalyticsConsent"
import { BattleScreen } from "./features/battle/BattleScreen"
import { closeBattle } from "./features/game/gameSlice"
import { DecksScreen } from "./features/menu/DecksScreen"
import { MainMenu } from "./features/menu/MainMenu"
import { ResumeScreen } from "./features/menu/ResumeScreen"
import { SettingsScreen } from "./features/menu/SettingsScreen"
import { OnlineScreen } from "./features/online/OnlineScreen"
import { OnlineGameScreen } from "./features/online/OnlineGameScreen"
import { LobbyRoomScreen } from "./features/online/LobbyRoomScreen"
import { ArenaStatusProvider } from "./features/online/ArenaStatus"
import {
  createApplicationServices,
  type ApplicationServices,
} from "./features/online/services"
import { clearSetup } from "./features/setup/setupSlice"
import { showSetup } from "./features/ui/uiSlice"
import { SetupScreen } from "./features/setup/SetupScreen"
import "./App.css"

const defaultServices = createApplicationServices()

type AppProps = {
  services?: ApplicationServices
}

export const App = ({ services = defaultServices }: AppProps) => {
  const dispatch = useAppDispatch()
  const bootStatus = useAppSelector(state => state.ui.bootStatus)
  const screen = useAppSelector(state => state.ui.screen)
  const game = useAppSelector(state => state.game.present)
  const route = useAppRoute()
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
    navigate("/offline")
  }

  let content
  if (route === "/") {
    content = <MainMenu />
  } else if (route === "/offline") {
    content = (
      <SetupScreen
        onBattleStarted={() => {
          navigate("/offline/battle")
        }}
      />
    )
  } else if (route === "/offline/battle") {
    content =
      screen === "battle" && game ? (
        <BattleScreen
          onNewBattle={() => {
            setConfirmNew(true)
          }}
        />
      ) : (
        <SetupScreen
          onBattleStarted={() => {
            navigate("/offline/battle")
          }}
        />
      )
  } else if (route === "/online") {
    content = (
      <OnlineScreen
        auth={services.auth}
        onlineGames={services.onlineGames}
        onEnterGame={gameId => {
          navigate(`/online/game/${encodeURIComponent(gameId)}`)
        }}
        onEnterLobby={gameId => {
          navigate(`/online/lobby/${encodeURIComponent(gameId)}`)
        }}
      />
    )
  } else if (route.startsWith("/online/lobby/")) {
    const authState = services.auth.getState()
    content = (
      <LobbyRoomScreen
        gameId={decodeURIComponent(route.slice("/online/lobby/".length))}
        deckOwnerId={
          authState.status === "signed-in" ? authState.user.uid : "signed-out"
        }
        onlineGames={services.onlineGames}
        onEnterGame={gameId => {
          navigate(`/online/game/${encodeURIComponent(gameId)}`, true)
        }}
        onLeave={() => {
          navigate("/online", true)
        }}
      />
    )
  } else if (route.startsWith("/online/game/")) {
    content = (
      <OnlineGameScreen
        gameId={decodeURIComponent(route.slice("/online/game/".length))}
        onlineGames={services.onlineGames}
      />
    )
  } else if (route === "/decks") {
    content = <DecksScreen auth={services.auth} />
  } else if (route === "/resume") {
    content = <ResumeScreen onlineGames={services.onlineGames} />
  } else {
    content = <SettingsScreen />
  }

  return (
    <ArenaStatusProvider onlineGames={services.onlineGames}>
      {content}
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
      <AnalyticsConsent route={route} />
    </ArenaStatusProvider>
  )
}
