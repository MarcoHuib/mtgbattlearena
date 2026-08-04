import { useEffect, useState } from "react"
import { useRegisterSW } from "virtual:pwa-register/react"

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000

type RegisteredServiceWorker = {
  registration: ServiceWorkerRegistration
  swUrl: string
}

export const checkForServiceWorkerUpdate = async ({
  registration,
  swUrl,
}: RegisteredServiceWorker) => {
  if (!navigator.onLine || registration.installing) return

  const response = await fetch(swUrl, {
    cache: "no-store",
    headers: {
      "cache-control": "no-cache",
    },
  })

  if (response.ok) {
    await registration.update()
  }
}

export const UpdatePrompt = () => {
  const [registeredServiceWorker, setRegisteredServiceWorker] =
    useState<RegisteredServiceWorker | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      if (registration) {
        setRegisteredServiceWorker({ registration, swUrl })
      }
    },
  })

  useEffect(() => {
    if (!registeredServiceWorker) return

    const { registration } = registeredServiceWorker
    const showWaitingUpdate = () => {
      if (registration.waiting) {
        setNeedRefresh(true)
      }
    }
    const trackInstallingWorker = () => {
      const installingWorker = registration.installing
      if (!installingWorker) return

      const showWhenInstalled = () => {
        if (
          installingWorker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          setNeedRefresh(true)
        }
      }
      installingWorker.addEventListener("statechange", showWhenInstalled)
    }
    const checkForUpdate = () => {
      if (document.visibilityState === "hidden") return

      showWaitingUpdate()
      void checkForServiceWorkerUpdate(registeredServiceWorker)
        .then(showWaitingUpdate)
        .catch(() => {
          // Een mislukte updatecontrole mag offline gebruik niet verstoren.
        })
    }
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") {
        checkForUpdate()
      }
    }

    showWaitingUpdate()

    checkForUpdate()
    const intervalId = window.setInterval(
      checkForUpdate,
      UPDATE_CHECK_INTERVAL_MS,
    )
    window.addEventListener("focus", checkForUpdate)
    window.addEventListener("online", checkForUpdate)
    document.addEventListener("visibilitychange", checkWhenVisible)
    registration.addEventListener("updatefound", trackInstallingWorker)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", checkForUpdate)
      window.removeEventListener("online", checkForUpdate)
      document.removeEventListener("visibilitychange", checkWhenVisible)
      registration.removeEventListener("updatefound", trackInstallingWorker)
    }
  }, [registeredServiceWorker, setNeedRefresh])

  if (!needRefresh) return null

  const installUpdate = async () => {
    setIsUpdating(true)
    setUpdateError(null)

    try {
      await updateServiceWorker(true)
    } catch {
      setUpdateError(
        "Bijwerken is niet gelukt. Controleer je verbinding en probeer opnieuw.",
      )
      setIsUpdating(false)
    }
  }

  return (
    <aside className="update-prompt" role="alert" aria-live="polite">
      <span>{updateError ?? "Een nieuwe appversie staat klaar."}</span>
      <button
        type="button"
        disabled={isUpdating}
        onClick={() => {
          void installUpdate()
        }}
      >
        {isUpdating ? "Bijwerken…" : "Nu bijwerken"}
      </button>
      <button
        type="button"
        disabled={isUpdating}
        onClick={() => {
          setNeedRefresh(false)
        }}
      >
        Later
      </button>
    </aside>
  )
}
