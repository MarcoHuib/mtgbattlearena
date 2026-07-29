import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { OnlineGameService } from "./types"

export type ArenaAvailability = "checking" | "online" | "offline" | "demo"

type ArenaStatusState = {
  status: ArenaAvailability
  message: string
  checkedAt: string | null
}

type ArenaStatusContextValue = ArenaStatusState & {
  retry(): Promise<void>
}

const ArenaStatusContext = createContext<ArenaStatusContextValue | null>(null)

const checkTimeoutMs = 5_000
const pollIntervalMs = 30_000

const initialState = (onlineGames: OnlineGameService): ArenaStatusState =>
  onlineGames.kind === "mock"
    ? {
        status: "demo",
        message: "Lokale demoarena actief.",
        checkedAt: null,
      }
    : {
        status: "checking",
        message: "Arena wordt gecontroleerd.",
        checkedAt: null,
      }

export const ArenaStatusProvider = ({
  onlineGames,
  children,
}: {
  onlineGames: OnlineGameService
  children: ReactNode
}) => {
  const [state, setState] = useState(() => initialState(onlineGames))
  const requestId = useRef(0)
  const activeController = useRef<AbortController | null>(null)

  const retry = useCallback(async () => {
    if (onlineGames.kind === "mock") {
      setState(initialState(onlineGames))
      return
    }

    const currentRequestId = requestId.current + 1
    requestId.current = currentRequestId
    activeController.current?.abort()

    if (!navigator.onLine) {
      setState({
        status: "offline",
        message: "Dit apparaat heeft geen netwerkverbinding.",
        checkedAt: new Date().toISOString(),
      })
      return
    }

    setState(current =>
      current.status === "online"
        ? current
        : {
            status: "checking",
            message: "Arena wordt gecontroleerd.",
            checkedAt: current.checkedAt,
          },
    )

    const controller = new AbortController()
    activeController.current = controller
    const timeout = window.setTimeout(() => {
      controller.abort()
    }, checkTimeoutMs)

    try {
      const health = await onlineGames.checkHealth(controller.signal)
      if (requestId.current !== currentRequestId) return
      const checkedAt = new Date().toISOString()
      setState(
        health.firebaseConfigured
          ? {
              status: "online",
              message: "Online arena bereikbaar.",
              checkedAt,
            }
          : {
              status: "offline",
              message: "Arena-authenticatie is niet geconfigureerd.",
              checkedAt,
            },
      )
    } catch {
      if (requestId.current !== currentRequestId) return
      setState({
        status: "offline",
        message: navigator.onLine
          ? "Online arena reageert niet."
          : "Dit apparaat heeft geen netwerkverbinding.",
        checkedAt: new Date().toISOString(),
      })
    } finally {
      window.clearTimeout(timeout)
      if (requestId.current === currentRequestId) {
        activeController.current = null
      }
    }
  }, [onlineGames])

  useEffect(() => {
    void retry()
    const interval = window.setInterval(() => {
      void retry()
    }, pollIntervalMs)
    const handleOnline = () => {
      void retry()
    }
    const handleOffline = () => {
      requestId.current += 1
      activeController.current?.abort()
      activeController.current = null
      setState({
        status: "offline",
        message: "Dit apparaat heeft geen netwerkverbinding.",
        checkedAt: new Date().toISOString(),
      })
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void retry()
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.clearInterval(interval)
      requestId.current += 1
      activeController.current?.abort()
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [retry])

  const value = useMemo(
    () => ({
      ...state,
      retry,
    }),
    [retry, state],
  )

  return (
    <ArenaStatusContext.Provider value={value}>
      {children}
    </ArenaStatusContext.Provider>
  )
}

export const useArenaStatus = () => {
  const value = useContext(ArenaStatusContext)
  if (!value) {
    throw new Error("useArenaStatus vereist een ArenaStatusProvider.")
  }
  return value
}
