import { AppLink } from "../../app/router"
import { AppShell } from "../../components/AppShell"
import { useAppSelector } from "../../app/hooks"

const menuItems = [
  {
    to: "/offline",
    eyebrow: "Speel direct",
    title: "Offline spelen",
    description:
      "Leg twee decks klaar en begin meteen. Geen account of server nodig.",
    glyph: "✦",
    featured: true,
  },
  {
    to: "/online",
    eyebrow: "2–6 spelers",
    title: "Online spelen",
    description:
      "Open een Commander-tafel of sluit aan met een uitnodigingscode.",
    glyph: "⚔",
    featured: true,
  },
  {
    to: "/decks",
    eyebrow: "Jouw collectie",
    title: "Decks beheren",
    description: "Importeer en beheer je lokale decks.",
    glyph: "◇",
    featured: false,
  },
  {
    to: "/resume",
    eyebrow: "Terug naar de tafel",
    title: "Spel hervatten",
    description: "Ga verder waar je laatste battle stopte.",
    glyph: "↻",
    featured: false,
  },
  {
    to: "/settings",
    eyebrow: "Jouw voorkeuren",
    title: "Instellingen",
    description: "Beheer opslag, netwerk en appstatus.",
    glyph: "✧",
    featured: false,
  },
] as const

export const MainMenu = () => {
  const game = useAppSelector(state => state.game.present)

  return (
    <AppShell activeRoute="/">
      <section className="menu-hero">
        <div className="menu-hero__copy">
          <span className="menu-hero__kicker">
            <span aria-hidden="true">✦</span>
            Jouw digitale spelltable
          </span>
          <h1>
            Roep je deck bijeen.
            <span> Begin de battle.</span>
          </h1>
          <p>
            Speel Magic zoals aan je eigen tafel: handmatig, vrij en met ruimte
            voor ieder onverwacht moment.
          </p>
          <div className="menu-hero__actions">
            <AppLink
              to="/offline"
              className="menu-hero__action menu-hero__action--primary"
            >
              <span aria-hidden="true">✦</span>
              Start lokale battle
            </AppLink>
            <AppLink
              to="/online"
              className="menu-hero__action menu-hero__action--secondary"
            >
              Betreed de online arena
              <span aria-hidden="true">→</span>
            </AppLink>
          </div>
        </div>
        <div className="menu-hero__showcase" aria-hidden="true">
          <span className="menu-hero__card menu-hero__card--left">
            <img src="/magic-card-back.webp" alt="" />
          </span>
          <span className="menu-hero__card menu-hero__card--center">
            <img src="/magic-card-back.webp" alt="" />
          </span>
          <span className="menu-hero__card menu-hero__card--right">
            <img src="/magic-card-back.webp" alt="" />
          </span>
          <span className="menu-hero__magic-orb">B</span>
        </div>
        <div className="menu-hero__status" aria-label="Spelstatus">
          <span
            className={`menu-hero__status-light ${game ? "is-ready" : ""}`}
            aria-hidden="true"
          />
          <span>
            <small>Spelltable</small>
            <strong>
              {game ? "Battle klaar om te hervatten" : "Klaar voor avontuur"}
            </strong>
          </span>
        </div>
      </section>

      <section className="menu-hall" aria-labelledby="menu-title">
        <div className="menu-hall__heading">
          <span className="eyebrow">Kies je pad</span>
          <h2 id="menu-title">Hoe wil je vandaag spelen?</h2>
          <p>
            Begin een nieuwe tafel, verzamel je decks of keer terug naar een
            lopende battle.
          </p>
        </div>
        <section className="menu-grid" aria-label="Hoofdmenu">
          {menuItems.map(item => (
            <AppLink
              key={item.to}
              to={item.to}
              className={`menu-card ${
                item.featured ? "menu-card--featured" : "menu-card--utility"
              }`}
            >
              <span className="menu-card__glyph" aria-hidden="true">
                {item.glyph}
              </span>
              <span className="eyebrow">{item.eyebrow}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <span className="menu-card__action">
                Openen <span aria-hidden="true">→</span>
              </span>
            </AppLink>
          ))}
        </section>
        <div className="menu-hall__promise">
          <span aria-hidden="true">◈</span>
          <p>
            <strong>Local-first.</strong> Je offline battles, autosaves en
            gedownloade kaarten blijven op jouw apparaat.
          </p>
        </div>
      </section>
    </AppShell>
  )
}
