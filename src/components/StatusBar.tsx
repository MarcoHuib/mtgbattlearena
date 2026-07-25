import { useAppSelector } from "../app/hooks"
import { useOnlineStatus } from "../hooks/useOnlineStatus"

const formatSavedAt = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(value))
    : null

export const StatusBar = () => {
  const online = useOnlineStatus()
  const saveStatus = useAppSelector(state => state.ui.saveStatus)
  const lastSavedAt = useAppSelector(state => state.ui.lastSavedAt)

  const saveLabel =
    saveStatus === "saving"
      ? "Opslaan…"
      : saveStatus === "error"
        ? "Opslaan mislukt"
        : lastSavedAt
          ? `Lokaal opgeslagen ${formatSavedAt(lastSavedAt) ?? ""}`
          : "Autosave actief"

  return (
    <div className="status-bar">
      <span className={`status-pill ${online ? "is-online" : "is-offline"}`}>
        <span className="status-dot" aria-hidden="true" />
        {online ? "Online" : "Offline"}
      </span>
      <span
        className={`status-pill save-status save-status--${saveStatus}`}
        aria-live="polite"
      >
        {saveLabel}
      </span>
    </div>
  )
}
