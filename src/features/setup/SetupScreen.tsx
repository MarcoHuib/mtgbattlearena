import { useAppDispatch, useAppSelector } from "../../app/hooks"
import { AppLink } from "../../app/router"
import { startBattleFromSetup } from "../../app/thunks"
import { Brand } from "../../components/Brand"
import { StatusBar } from "../../components/StatusBar"
import { DeckSlot } from "./DeckSlot"

type SetupScreenProps = {
  onBattleStarted?: () => void
}

export const SetupScreen = ({ onBattleStarted }: SetupScreenProps) => {
  const dispatch = useAppDispatch()
  const firstReady =
    useAppSelector(state => state.setup["player-1"].status) === "ready"
  const secondReady =
    useAppSelector(state => state.setup["player-2"].status) === "ready"

  return (
    <main className="setup-screen">
      <header className="app-header">
        <AppLink to="/" className="brand-link">
          <Brand />
        </AppLink>
        <StatusBar />
      </header>
      <section className="setup-hero">
        <div className="setup-hero__copy">
          <span className="eyebrow">Twee decks · één lokale tafel</span>
          <h1>Leg je battle klaar.</h1>
          <p>
            Importeer twee openbare Archidekt-decks. Daarna blijft de battle
            lokaal beschikbaar en bestuur jij beide kanten van het veld.
          </p>
        </div>
        <div className="setup-hero__seal" aria-hidden="true">
          <span>VS</span>
        </div>
      </section>
      <section className="deck-grid" aria-label="Decks instellen">
        <DeckSlot playerId="player-1" number={1} />
        <div className="versus-line" aria-hidden="true">
          <span>versus</span>
        </div>
        <DeckSlot playerId="player-2" number={2} />
      </section>
      <footer className="setup-actions">
        <p>
          Commanders gaan naar de command zone; beide spelers trekken
          automatisch zeven kaarten.
        </p>
        <button
          className="button button--primary button--large"
          type="button"
          disabled={!firstReady || !secondReady}
          onClick={() => {
            dispatch(startBattleFromSetup())
            onBattleStarted?.()
          }}
        >
          Battle starten
        </button>
      </footer>
    </main>
  )
}
