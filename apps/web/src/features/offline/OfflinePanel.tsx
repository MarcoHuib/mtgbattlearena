import { useAppDispatch, useAppSelector } from "../../app/hooks"
import { cancelOfflineDownload, downloadOfflineBattle } from "./offlineService"
import { setOfflinePanel } from "./offlineSlice"

const formatBytes = (bytes: number) =>
  new Intl.NumberFormat("nl-NL", {
    style: "unit",
    unit: "megabyte",
    maximumFractionDigits: 1,
  }).format(bytes / 1_000_000)

export const OfflinePanel = () => {
  const dispatch = useAppDispatch()
  const record = useAppSelector(state => state.offline.current)
  const open = useAppSelector(state => state.offline.panelOpen)
  if (!open) return null

  const progress = record?.totalAssets
    ? Math.round((record.completedAssets / record.totalAssets) * 100)
    : record?.status === "complete"
      ? 100
      : 0

  return (
    <aside className="offline-panel" aria-labelledby="offline-title">
      <div className="offline-panel__heading">
        <div>
          <span className="eyebrow">Expliciet lokaal pakket</span>
          <h2 id="offline-title">Offline beschikbaar maken</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Offlinepaneel sluiten"
          onClick={() => {
            dispatch(setOfflinePanel(false))
          }}
        >
          ×
        </button>
      </div>
      <p>
        Decksnapshots en spelstatus staan al in IndexedDB. Deze stap bewaart
        daarnaast iedere unieke kaartzijde duurzaam in een apart offlinecache.
      </p>
      {record ? (
        <div className="offline-progress" aria-live="polite">
          <div className="offline-progress__summary">
            <strong>
              {record.status === "complete"
                ? "Volledig offline beschikbaar"
                : record.status === "failed"
                  ? "Download onvolledig"
                  : record.status === "cancelled"
                    ? "Download geannuleerd"
                    : "Kaartafbeeldingen downloaden"}
            </strong>
            <span>{progress}%</span>
          </div>
          <progress
            value={record.completedAssets}
            max={record.totalAssets || 1}
          >
            {progress}%
          </progress>
          <dl>
            <div>
              <dt>Unieke assets</dt>
              <dd>
                {record.completedAssets} / {record.totalAssets}
              </dd>
            </div>
            <div>
              <dt>Gedownload</dt>
              <dd>{formatBytes(record.downloadedBytes)}</dd>
            </div>
            <div>
              <dt>Mislukt</dt>
              <dd>{record.failedAssets}</dd>
            </div>
          </dl>
          {record.persistentStorage !== "granted" ? (
            <p className="warning-message">
              De browser heeft geen gegarandeerde persistente opslag toegekend.
              Het pakket is apart opgeslagen, maar het besturingssysteem kan
              opslag onder druk alsnog opruimen.
            </p>
          ) : null}
          {record.failedAssets > 0 ? (
            <details>
              <summary>Mislukte afbeeldingen ({record.failedAssets})</summary>
              <ul>
                {Object.values(record.assets)
                  .filter(asset => asset.status === "failed")
                  .map(asset => (
                    <li key={asset.assetKey}>
                      {asset.assetKey}: {asset.error}
                    </li>
                  ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : (
        <div className="offline-empty">
          De download dedupliceert afbeeldingen en neemt alle bekende zijden van
          dubbelzijdige kaarten mee.
        </div>
      )}
      <div className="offline-panel__actions">
        {record?.status === "downloading" ? (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              void dispatch(cancelOfflineDownload())
            }}
          >
            Annuleren
          </button>
        ) : null}
        {record?.status !== "complete" && record?.status !== "downloading" ? (
          <button
            className="button button--primary"
            type="button"
            onClick={() => {
              void dispatch(downloadOfflineBattle())
            }}
          >
            {record?.status === "failed"
              ? "Mislukte assets opnieuw proberen"
              : "Download voor offline gebruik"}
          </button>
        ) : null}
      </div>
    </aside>
  )
}
