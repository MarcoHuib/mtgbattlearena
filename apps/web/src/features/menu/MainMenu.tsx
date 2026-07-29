import { AppLink } from "../../app/router"
import { AppShell } from "../../components/AppShell"
import { useAppSelector } from "../../app/hooks"
import type { OnlineGameService } from "../online/types"

type MainMenuProps = {
  onlineGames: OnlineGameService
}

const menuItems = [
  {
    to: "/offline",
    eyebrow: "Zonder account",
    title: "Offline spelen",
    description:
      "Importeer twee decks of start een nieuwe lokale tafel. Autosave en offlinepakketten blijven beschikbaar.",
  },
  {
    to: "/online",
    eyebrow: "2–6 spelers",
    title: "Online spelen",
    description:
      "Log in, bekijk openbare lobby’s of neem deel met een gamecode.",
  },
  {
    to: "/decks",
    eyebrow: "Lokale snapshots",
    title: "Decks beheren",
    description:
      "Bekijk hoe geïmporteerde decks lokaal worden vastgelegd en bereid een nieuwe import voor.",
  },
  {
    to: "/resume",
    eyebrow: "Offline en online apart",
    title: "Spel hervatten",
    description:
      "Ga verder met je laatste lokale battle of een bekende online sessie.",
  },
  {
    to: "/settings",
    eyebrow: "App en verbinding",
    title: "Instellingen",
    description:
      "Bekijk opslag-, netwerk- en backendstatus zonder je offline spel te blokkeren.",
  },
] as const

export const MainMenu = ({ onlineGames }: MainMenuProps) => {
  const game = useAppSelector(state => state.game.present)

  return (
    <AppShell activeRoute="/">
      <section className="menu-hero">
        <div>
          <span className="eyebrow">Local-first Magic-tafel</span>
          <h1>Kies hoe je wilt spelen.</h1>
          <p>
            Offline blijft altijd lokaal en zonder login beschikbaar. Online is
            een aanvullende, server-authoritative modus.
          </p>
        </div>
        <div className="menu-hero__status">
          <strong>
            {game ? "Lokale battle gevonden" : "Klaar voor een nieuwe battle"}
          </strong>
          <span>
            Online adapter:{" "}
            {onlineGames.kind === "mock" ? "demo/mock" : "Cloudflare"}
          </span>
        </div>
      </section>
      <section className="menu-grid" aria-label="Hoofdmenu">
        {menuItems.map(item => (
          <AppLink key={item.to} to={item.to} className="menu-card">
            <span className="eyebrow">{item.eyebrow}</span>
            <h2>{item.title}</h2>
            <p>{item.description}</p>
            <span className="menu-card__action">Openen →</span>
          </AppLink>
        ))}
      </section>
    </AppShell>
  )
}
