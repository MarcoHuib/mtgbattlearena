import { AppShell } from "../../components/AppShell"
import { useOnlineStatus } from "../../hooks/useOnlineStatus"
import { setAnalyticsConsent } from "../../analytics"
import { useAnalyticsConsent } from "../../components/AnalyticsConsent"

export const SettingsScreen = () => {
  const online = useOnlineStatus()
  const analyticsConsent = useAnalyticsConsent()

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
            <h2>Online multiplayer</h2>
            <p>
              De app controleert de arena via een afzonderlijke
              serverhealthcheck.
            </p>
            <small>
              De actuele arenastatus staat altijd op dezelfde plek in de
              hoofdbalk.
            </small>
          </div>
          <div className="content-card">
            <h2>Lokale opslag</h2>
            <p>
              Offline autosave, deck snapshots en offlinepakketten gebruiken
              IndexedDB.
            </p>
          </div>
          <div className="content-card">
            <h2>Analytische cookies</h2>
            <p>
              {analyticsConsent === "granted"
                ? "Firebase Analytics is toegestaan."
                : analyticsConsent === "denied"
                  ? "Firebase Analytics is uitgeschakeld."
                  : "Je hebt nog geen keuze gemaakt."}
            </p>
            <button
              className="button button--secondary"
              type="button"
              onClick={() =>
                void setAnalyticsConsent(
                  analyticsConsent === "granted" ? "denied" : "granted",
                )
              }
            >
              {analyticsConsent === "granted"
                ? "Toestemming intrekken"
                : "Analytics toestaan"}
            </button>
          </div>
        </div>
      </section>
    </AppShell>
  )
}
