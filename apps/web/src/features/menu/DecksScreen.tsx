import { useEffect, useState, useSyncExternalStore } from "react"
import { deckCardCount } from "@mtg/game-core/decks"
import type { DeckSnapshot } from "@mtg/game-core/types"
import { AppLink } from "../../app/router"
import { AppShell } from "../../components/AppShell"
import { deviceDeckOwnerId, repositories } from "../../persistence/database"
import type { AuthService } from "../online/types"

type DecksScreenProps = {
  auth: AuthService
}

export const DecksScreen = ({ auth }: DecksScreenProps) => {
  const authState = useSyncExternalStore(
    listener => auth.subscribe(listener),
    () => auth.getState(),
    () => auth.getState(),
  )
  const ownerId =
    authState.status === "signed-in" ? authState.user.uid : deviceDeckOwnerId
  const [decks, setDecks] = useState<DeckSnapshot[]>([])
  const [deviceDecks, setDeviceDecks] = useState<DeckSnapshot[]>([])
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    void Promise.all([
      repositories.decks.list(ownerId),
      ownerId === deviceDeckOwnerId
        ? Promise.resolve([])
        : repositories.decks.list(deviceDeckOwnerId),
    ])
      .then(([records, legacyRecords]) => {
        if (disposed) return
        setDecks(records)
        setDeviceDecks(
          legacyRecords.filter(
            legacy => !records.some(record => record.id === legacy.id),
          ),
        )
        setStatus("ready")
      })
      .catch(() => {
        if (!disposed) setStatus("error")
      })
    return () => {
      disposed = true
    }
  }, [ownerId])

  const removeDeck = async (deck: DeckSnapshot, deckOwnerId = ownerId) => {
    try {
      await repositories.decks.delete(deck.id, deckOwnerId)
      if (deckOwnerId === deviceDeckOwnerId) {
        setDeviceDecks(current =>
          current.filter(candidate => candidate.id !== deck.id),
        )
      } else {
        setDecks(current =>
          current.filter(candidate => candidate.id !== deck.id),
        )
      }
      setMessage(`${deck.name} is uit jouw decklijst verwijderd.`)
    } catch {
      setMessage(`${deck.name} kon niet worden verwijderd.`)
    } finally {
      setConfirmDeleteId(null)
    }
  }

  const claimDeviceDeck = async (deck: DeckSnapshot) => {
    try {
      await repositories.decks.save(deck, ownerId)
      await repositories.decks.delete(deck.id, deviceDeckOwnerId)
      const [nextDecks, nextDeviceDecks] = await Promise.all([
        repositories.decks.list(ownerId),
        repositories.decks.list(deviceDeckOwnerId),
      ])
      setDecks(nextDecks)
      setDeviceDecks(nextDeviceDecks)
      setMessage(`${deck.name} is aan jouw account gekoppeld.`)
    } catch {
      setMessage(`${deck.name} kon niet aan jouw account worden gekoppeld.`)
    }
  }

  return (
    <AppShell>
      <section className="content-page">
        <span className="eyebrow">Jouw lokale, onveranderlijke snapshots</span>
        <h1>Decks beheren</h1>
        <p>
          Deze lijst is gekoppeld aan de huidige gebruiker op dit apparaat. Een
          lopende battle verandert niet wanneer je een deck uit de lijst
          verwijdert.
        </p>
        {message ? (
          <p className="inline-message" role="status">
            {message}
          </p>
        ) : null}
        <div className="content-card">
          <h2>Opgeslagen decks</h2>
          {status === "loading" ? <p>Decks laden…</p> : null}
          {status === "error" ? (
            <p role="alert">De lokale deckopslag kon niet worden gelezen.</p>
          ) : null}
          {status === "ready" && decks.length === 0 ? (
            <p>Je hebt nog geen deck onder deze gebruiker opgeslagen.</p>
          ) : null}
          {decks.length ? (
            <ul className="managed-deck-list">
              {decks.map(deck => (
                <li key={deck.id}>
                  <div>
                    <strong>{deck.name}</strong>
                    <span>
                      {deck.source} {deck.sourceId} · {deckCardCount(deck)}{" "}
                      kaarten
                    </span>
                  </div>
                  {confirmDeleteId === deck.id ? (
                    <div className="managed-deck-list__actions">
                      <button
                        className="button button--secondary"
                        type="button"
                        onClick={() => {
                          setConfirmDeleteId(null)
                        }}
                      >
                        Annuleren
                      </button>
                      <button
                        className="button button--danger"
                        type="button"
                        onClick={() => void removeDeck(deck)}
                      >
                        Definitief verwijderen
                      </button>
                    </div>
                  ) : (
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() => {
                        setConfirmDeleteId(deck.id)
                      }}
                    >
                      Verwijderen
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {deviceDecks.length ? (
            <section
              className="legacy-deck-section"
              aria-labelledby="legacy-decks-title"
            >
              <span className="eyebrow">Herstel oude imports</span>
              <h3 id="legacy-decks-title">
                Decks van vóór de accountscheiding
              </h3>
              <p>
                Deze imports staan nog veilig op dit apparaat, maar hadden nog
                geen eigenaar. Koppel alleen jouw eigen decks aan dit account.
              </p>
              <ul className="managed-deck-list">
                {deviceDecks.map(deck => (
                  <li key={deck.id}>
                    <div>
                      <strong>{deck.name}</strong>
                      <span>
                        {deck.source} {deck.sourceId} · {deckCardCount(deck)}{" "}
                        kaarten
                      </span>
                    </div>
                    <div className="managed-deck-list__actions">
                      <button
                        className="button button--primary"
                        type="button"
                        onClick={() => void claimDeviceDeck(deck)}
                      >
                        Aan mijn account koppelen
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <AppLink to="/offline" className="button button--primary">
            Decks importeren
          </AppLink>
        </div>
      </section>
    </AppShell>
  )
}
