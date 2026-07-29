import { AppShell } from "../../components/AppShell"
import { useOnlineStatus } from "../../hooks/useOnlineStatus"
import type { OnlineGameService } from "../online/types"

type SettingsScreenProps = {
  onlineGames: OnlineGameService
}

export const SettingsScreen = ({ onlineGames }: SettingsScreenProps) => {
  const online = useOnlineStatus()

  return (
    <AppShell>
      <section className="content-page">
        <span className="eyebrow">Appstatus</span>
        <h1>Instellingen</h1>
        <div className="settings-list">
          <div className="content-card">
            <h2>Netwerk</h2>
            <p>
              {online
                ? "Browser meldt een netwerkverbinding."
                : "Browser is offline."}
            </p>
            <small>
              Elke request houdt daarnaast een eigen fout- en timeoutpad.
            </small>
          </div>
          <div className="content-card">
            <h2>Online backend</h2>
            <p>
              {onlineGames.kind === "mock"
                ? "Demomodus actief: login en lobby’s draaien met lokale mocks."
                : "Cloudflare-adapter actief."}
            </p>
            <small>
              Stel VITE_ONLINE_API_URL in om de HTTP-adapter te activeren.
            </small>
          </div>
          <div className="content-card">
            <h2>Lokale opslag</h2>
            <p>
              Offline autosave, deck snapshots en offlinepakketten gebruiken
              IndexedDB.
            </p>
          </div>
        </div>
      </section>
    </AppShell>
  )
}
