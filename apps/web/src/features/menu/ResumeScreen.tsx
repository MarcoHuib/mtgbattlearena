import { AppLink } from "../../app/router"
import { useAppSelector } from "../../app/hooks"
import { AppShell } from "../../components/AppShell"
import type { OnlineGameService } from "../online/types"

type ResumeScreenProps = {
  onlineGames: OnlineGameService
}

export const ResumeScreen = ({ onlineGames }: ResumeScreenProps) => {
  const game = useAppSelector(state => state.game.present)
  const lastSavedAt = useAppSelector(state => state.ui.lastSavedAt)

  return (
    <AppShell activeRoute="/resume">
      <section className="content-page">
        <span className="eyebrow">Bron van waarheid blijft zichtbaar</span>
        <h1>Spel hervatten</h1>
        <div className="resume-grid">
          <article className="content-card">
            <span className="mode-badge">Offline · lokaal authoritative</span>
            <h2>{game?.title ?? "Geen lokale battle gevonden"}</h2>
            <p>
              {lastSavedAt
                ? `Laatst lokaal opgeslagen op ${new Date(lastSavedAt).toLocaleString("nl-NL")}.`
                : "Een nieuwe battle wordt automatisch lokaal opgeslagen."}
            </p>
            <AppLink
              to={game ? "/offline/battle" : "/offline"}
              className="button button--primary"
            >
              {game ? "Lokale battle hervatten" : "Nieuwe offline battle"}
            </AppLink>
          </article>
          <article className="content-card">
            <span className="mode-badge">Online · server authoritative</span>
            <h2>Online sessies</h2>
            <p>
              {onlineGames.kind === "mock"
                ? "In demomodus worden geen online sessies duurzaam bewaard."
                : "Na login worden reconnectmetadata en verse persoonlijke snapshots opgehaald."}
            </p>
            <AppLink to="/online" className="button button--secondary">
              Naar online lobby’s
            </AppLink>
          </article>
        </div>
      </section>
    </AppShell>
  )
}
