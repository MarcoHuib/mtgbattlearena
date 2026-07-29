import { useAppSelector } from "../app/hooks"
import { useArenaStatus } from "../features/online/ArenaStatus"

const formatSavedAt = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(value))
    : null

export const StatusBar = ({
  onlineStateLabel,
}: {
  onlineStateLabel?: string
}) => {
  const arena = useArenaStatus()
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
  const arenaLabel =
    arena.status === "checking"
      ? "Arena controleren…"
      : arena.status === "online"
        ? "Arena online"
        : arena.status === "demo"
          ? "Demoarena"
          : "Arena offline"

  return (
    <div className="status-bar">
      <span
        className={`status-pill arena-status is-${arena.status}`}
        title={arena.message}
        aria-live="polite"
      >
        <span className="status-dot" aria-hidden="true" />
        {arenaLabel}
      </span>
      <span
        className={`status-pill save-status save-status--${saveStatus}`}
        aria-live="polite"
      >
        {onlineStateLabel ?? saveLabel}
      </span>
    </div>
  )
}
