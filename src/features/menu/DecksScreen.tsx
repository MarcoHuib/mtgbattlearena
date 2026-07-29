import { AppLink } from "../../app/router"
import { AppShell } from "../../components/AppShell"
import { useAppSelector } from "../../app/hooks"

export const DecksScreen = () => {
  const game = useAppSelector(state => state.game.present)

  return (
    <AppShell>
      <section className="content-page">
        <span className="eyebrow">Lokale, onveranderlijke snapshots</span>
        <h1>Decks beheren</h1>
        <p>
          Decks worden tijdens Archidekt-import als lokale snapshot opgeslagen.
          Een lopende battle verandert nooit automatisch wanneer het brondeck
          wijzigt.
        </p>
        <div className="content-card">
          <h2>
            {game ? "Decks van de laatste battle" : "Nog geen actieve decks"}
          </h2>
          {game ? (
            <ul>
              {Object.values(game.players).map(player => (
                <li key={player.id}>{player.name}</li>
              ))}
            </ul>
          ) : (
            <p>Start een offline import om je eerste snapshots op te slaan.</p>
          )}
          <AppLink to="/offline" className="button button--primary">
            Decks importeren
          </AppLink>
        </div>
      </section>
    </AppShell>
  )
}
