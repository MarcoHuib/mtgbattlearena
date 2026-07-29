import { useRegisterSW } from "virtual:pwa-register/react"

export const UpdatePrompt = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null
  return (
    <aside className="update-prompt" aria-live="polite">
      <span>Een nieuwe appversie staat klaar.</span>
      <button
        type="button"
        onClick={() => {
          void updateServiceWorker(true)
        }}
      >
        Nu bijwerken
      </button>
      <button
        type="button"
        onClick={() => {
          setNeedRefresh(false)
        }}
      >
        Later
      </button>
    </aside>
  )
}
