import { useAppDispatch, useAppSelector } from "../../app/hooks"
import { AppLink } from "../../app/router"
import { startBattleFromSetup } from "../../app/thunks"
import { Brand } from "../../components/Brand"
import { StatusBar } from "../../components/StatusBar"
import { DeckSlot } from "./DeckSlot"
import { addPlayer } from "./setupSlice"

type SetupScreenProps = {
  onBattleStarted?: () => void
}

export const SetupScreen = ({ onBattleStarted }: SetupScreenProps) => {
  const dispatch = useAppDispatch()
  const setup = useAppSelector(state => state.setup)
  const canStart = setup.playerOrder.every(playerId => {
    const player = setup.players[playerId]
    return player?.status === "ready" && Boolean(player.name.trim())
  })

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
          <span className="eyebrow">2–6 spelers · één lokale tafel</span>
          <h1>Leg je battle klaar.</h1>
          <p>
            Stel twee tot zes spelers in en importeer voor iedereen een openbaar
            Archidekt-deck. Daarna blijft de battle lokaal beschikbaar.
          </p>
        </div>
        <div className="setup-hero__seal" aria-hidden="true">
          <span>VS</span>
        </div>
      </section>
      <section className="deck-grid" aria-label="Decks instellen">
        {setup.playerOrder.map((playerId, index) => (
          <DeckSlot
            key={playerId}
            playerId={playerId}
            number={index + 1}
            canRemove={setup.playerOrder.length > 2}
          />
        ))}
      </section>
      <footer className="setup-actions">
        <p>
          Commanders gaan naar de command zone; iedere speler trekt automatisch
          zeven kaarten.
        </p>
        <button
          className="button button--secondary button--large"
          type="button"
          disabled={setup.playerOrder.length >= 6}
          onClick={() => dispatch(addPlayer())}
        >
          Speler toevoegen
        </button>
        <button
          className="button button--primary button--large"
          type="button"
          disabled={!canStart}
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
