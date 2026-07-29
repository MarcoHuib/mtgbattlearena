import { useEffect, useState, type MouseEvent, type ReactNode } from "react"

export type AppRoute =
  | "/"
  | "/offline"
  | "/offline/battle"
  | "/online"
  | `/online/game/${string}`
  | "/decks"
  | "/resume"
  | "/settings"

const knownRoutes = new Set<AppRoute>([
  "/",
  "/offline",
  "/offline/battle",
  "/online",
  "/decks",
  "/resume",
  "/settings",
])

const currentRoute = (): AppRoute => {
  const path = window.location.pathname.replace(/\/+$/, "") || "/"
  if (/^\/online\/game\/[^/]+$/.test(path)) {
    return path as `/online/game/${string}`
  }
  return knownRoutes.has(path as AppRoute) ? (path as AppRoute) : "/"
}

export const navigate = (route: AppRoute, replace = false) => {
  const method = replace ? "replaceState" : "pushState"
  window.history[method]({}, "", route)
  window.dispatchEvent(new PopStateEvent("popstate"))
}

export const useAppRoute = () => {
  const [route, setRoute] = useState<AppRoute>(currentRoute)

  useEffect(() => {
    const onLocationChange = () => {
      setRoute(currentRoute())
    }
    window.addEventListener("popstate", onLocationChange)
    return () => {
      window.removeEventListener("popstate", onLocationChange)
    }
  }, [])

  return route
}

type AppLinkProps = {
  to: AppRoute
  className?: string
  children: ReactNode
}

export const AppLink = ({ to, className, children }: AppLinkProps) => {
  const followLink = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }
    event.preventDefault()
    navigate(to)
  }

  return (
    <a href={to} className={className} onClick={followLink}>
      {children}
    </a>
  )
}
