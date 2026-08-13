import type { ReactNode } from "react"
import { AppLink, type AppRoute } from "../app/router"
import { Brand } from "./Brand"
import { StatusBar } from "./StatusBar"

type AppShellProps = {
  children: ReactNode
  activeRoute?: AppRoute
}

const navigation: { route: AppRoute; label: string }[] = [
  { route: "/", label: "Menu" },
  { route: "/offline", label: "Offline" },
  { route: "/online", label: "Online" },
  { route: "/decks", label: "Decks" },
  { route: "/resume", label: "Hervatten" },
]

export const AppShell = ({ children, activeRoute }: AppShellProps) => (
  <main className="menu-shell">
    <header className="app-header menu-header">
      <AppLink to="/" className="brand-link">
        <Brand />
      </AppLink>
      <nav className="main-nav" aria-label="Hoofdnavigatie">
        {navigation.map(item => (
          <AppLink
            key={item.route}
            to={item.route}
            className={
              activeRoute === item.route
                ? "main-nav__link is-active"
                : "main-nav__link"
            }
          >
            {item.label}
          </AppLink>
        ))}
      </nav>
      <StatusBar />
    </header>
    {children}
  </main>
)
