import { useCallback, useEffect, useState } from "react"
import type { CloudDeckMetadata } from "@mtg/game-core/types"
import { AppLink } from "../../app/router"
import { AppShell } from "../../components/AppShell"
import { createFirestoreCloudDeckRepository } from "../decks/cloudDeckRepository"
import { readFirebaseConfig } from "./firebaseAuth"
import type { LobbyRoom, OnlineGameService } from "./types"
import { lobbyRoomSchema } from "./types"
import { useLobbyQuery } from "../../app/api/remoteGraphqlApi"

type LobbyRoomScreenProps = {
  gameId: string
  deckOwnerId: string
  onlineGames: OnlineGameService
  onEnterGame: (gameId: string) => void
  onLeave: () => void
}

const lobbyFirebaseConfig = readFirebaseConfig(import.meta.env)
const lobbyDeckRepository = lobbyFirebaseConfig.configured
  ? createFirestoreCloudDeckRepository(lobbyFirebaseConfig.options)
  : null

export const LobbyRoomScreen = ({
  gameId,
  deckOwnerId,
  onlineGames,
  onEnterGame,
  onLeave,
}: LobbyRoomScreenProps) => {
  const deckRepository = lobbyDeckRepository
  const usesGraphQLQuery = onlineGames.kind === "cloudflare"
  const lobbyQuery = useLobbyQuery(
    { id: gameId },
    {
      skip: !usesGraphQLQuery,
      pollingInterval: 10_000,
      refetchOnFocus: true,
    },
  )
  const [legacyRoom, setLegacyRoom] = useState<LobbyRoom | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [message, setMessage] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [decks, setDecks] = useState<CloudDeckMetadata[]>([])
  const [selectedDeckId, setSelectedDeckId] = useState("")
  const [deckBusy, setDeckBusy] = useState(false)
  const [starting, setStarting] = useState(false)

  const loadRoom = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const nextRoom = await onlineGames.getLobbyRoom(gameId, signal)
        setLegacyRoom(nextRoom)
        setStatus("ready")
        setMessage(null)
        if (nextRoom.lobby.status === "active") onEnterGame(gameId)
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        setStatus("error")
        setMessage(
          error instanceof Error
            ? error.message
            : "De lobby kon niet worden geladen.",
        )
      }
    },
    [gameId, onEnterGame, onlineGames],
  )

  useEffect(() => {
    if (usesGraphQLQuery) return
    const controller = new AbortController()
    let disposed = false
    let timeout: number | undefined

    const schedule = () => {
      if (disposed || document.visibilityState !== "visible") return
      timeout = window.setTimeout(() => {
        void poll()
      }, 10_000)
    }
    const poll = async () => {
      if (disposed || document.visibilityState !== "visible") return
      await loadRoom(controller.signal)
      schedule()
    }
    const handleVisibilityChange = () => {
      if (timeout !== undefined) window.clearTimeout(timeout)
      timeout = undefined
      if (document.visibilityState === "visible") void poll()
    }

    void poll()
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      disposed = true
      controller.abort()
      if (timeout !== undefined) window.clearTimeout(timeout)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [loadRoom, usesGraphQLQuery])

  const room = usesGraphQLQuery
    ? lobbyQuery.data
      ? lobbyRoomSchema.parse(lobbyQuery.data.lobby)
      : null
    : legacyRoom
  const effectiveStatus = usesGraphQLQuery
    ? lobbyQuery.isError
      ? "error"
      : room
        ? "ready"
        : "loading"
    : status
  const effectiveMessage = usesGraphQLQuery
    ? lobbyQuery.error &&
      "data" in lobbyQuery.error &&
      typeof lobbyQuery.error.data === "object" &&
      lobbyQuery.error.data !== null &&
      "message" in lobbyQuery.error.data
      ? lobbyQuery.error.data.message
      : lobbyQuery.isError
        ? "De lobby kon niet worden geladen."
        : message
    : message

  useEffect(() => {
    if (room?.lobby.status === "active") onEnterGame(gameId)
  }, [gameId, onEnterGame, room?.lobby.status])

  useEffect(() => {
    let disposed = false
    if (!deckRepository || deckOwnerId === "signed-out") {
      setDecks([])
      return
    }
    void deckRepository
      .list(deckOwnerId)
      .then(records => {
        if (disposed) return
        setDecks(records)
        setSelectedDeckId(current => current || records[0]?.deckKey || "")
      })
      .catch(() => {
        if (!disposed) {
          setMessage("Lokale decks konden niet worden geladen.")
        }
      })
    return () => {
      disposed = true
    }
  }, [deckOwnerId, deckRepository])

  const copyCode = async () => {
    if (!room) return
    try {
      await navigator.clipboard.writeText(room.lobby.code)
      setMessage("Gamecode gekopieerd.")
    } catch {
      setMessage(`Gamecode: ${room.lobby.code}`)
    }
  }

  const removeLobby = async () => {
    setDeleting(true)
    setMessage(null)
    try {
      await onlineGames.deleteLobby(gameId)
      onLeave()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "De lobby kon niet worden verwijderd.",
      )
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const registerDeck = async () => {
    const deck = decks.find(candidate => candidate.deckKey === selectedDeckId)
    if (!deck) {
      setMessage("Kies eerst een lokaal deck.")
      return
    }
    setDeckBusy(true)
    setMessage("Deck registreren…")
    try {
      await onlineGames.registerDeck(gameId, deck.deckKey)
      await loadRoom()
      setMessage(`${deck.name} staat gereed voor deze battle.`)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Het deck kon niet worden geregistreerd.",
      )
    } finally {
      setDeckBusy(false)
    }
  }

  const startBattle = async () => {
    setStarting(true)
    setMessage("Battle starten…")
    try {
      await onlineGames.startGame(gameId)
      onEnterGame(gameId)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "De battle kon niet worden gestart.",
      )
      setStarting(false)
      await loadRoom()
    }
  }

  if (effectiveStatus === "loading" && !room) {
    return (
      <AppShell activeRoute="/online">
        <section className="lobby-room-page">
          <div className="lobby-room-loading" aria-live="polite">
            <span className="lobby-room-loading__orb" aria-hidden="true" />
            <strong>De tafel wordt klaargezet…</strong>
            <span>Spelers en seats worden opgehaald.</span>
          </div>
        </section>
      </AppShell>
    )
  }

  if (!room) {
    return (
      <AppShell activeRoute="/online">
        <section className="lobby-room-page">
          <div className="lobby-room-error" role="alert">
            <span className="eyebrow">Lobby niet beschikbaar</span>
            <h1>Deze tafel kon niet worden geopend.</h1>
            <p>{effectiveMessage}</p>
            <button
              className="button button--primary"
              type="button"
              onClick={onLeave}
            >
              Terug naar online
            </button>
          </div>
        </section>
      </AppShell>
    )
  }

  const players = room.participants.filter(
    participant => participant.role === "player",
  )
  const spectators = room.participants.filter(
    participant => participant.role === "spectator",
  )
  const isHost = room.lobby.viewerRole === "host"
  const viewer = room.participants.find(participant => participant.isViewer)
  const seats = Array.from({ length: room.lobby.maxPlayers }, (_, seatNumber) =>
    players.find(participant => participant.seatNumber === seatNumber),
  )
  const openSeats = room.lobby.maxPlayers - players.length
  const playersWithoutDeck = players.filter(
    participant => !participant.deckReady,
  ).length
  const canStart =
    isHost && openSeats === 0 && playersWithoutDeck === 0 && !starting
  const selectedDeck =
    decks.find(deck => deck.deckKey === selectedDeckId) ?? null

  return (
    <AppShell activeRoute="/online">
      <section className="lobby-room-page">
        <header className="lobby-room-hero">
          <button className="lobby-room-back" type="button" onClick={onLeave}>
            <span aria-hidden="true">←</span> Online overzicht
          </button>
          <div className="lobby-room-hero__title">
            <span className="eyebrow">
              {isHost ? "Jouw online tafel" : "Online wachtkamer"}
            </span>
            <h1>{room.lobby.title}</h1>
            <p>
              {isHost
                ? "Nodig je groep uit en houd de bezetting van de tafel in de gaten."
                : `Je bent aangemeld bij de tafel van ${room.lobby.hostDisplayName}.`}
            </p>
          </div>
          <button
            className="lobby-code"
            type="button"
            onClick={() => void copyCode()}
            aria-label={`Gamecode ${room.lobby.code} kopiëren`}
          >
            <span>Gamecode</span>
            <strong>{room.lobby.code}</strong>
            <small>Klik om te kopiëren</small>
          </button>
        </header>

        <div className="lobby-room-grid">
          <section className="lobby-seats" aria-labelledby="lobby-seats-title">
            <div className="lobby-room-section-heading">
              <div>
                <span className="eyebrow">Spelers</span>
                <h2 id="lobby-seats-title">
                  {players.length}/{room.lobby.maxPlayers} seats bezet
                </h2>
              </div>
              <span className="lobby-live-status">
                <span aria-hidden="true" />
                Live bijgewerkt
              </span>
            </div>
            <div className="lobby-seat-list">
              {seats.map((participant, seatNumber) => (
                <article
                  className={
                    participant
                      ? "lobby-seat is-occupied"
                      : "lobby-seat is-empty"
                  }
                  key={seatNumber}
                >
                  <span className="lobby-seat__number">{seatNumber + 1}</span>
                  <span className="lobby-seat__avatar" aria-hidden="true">
                    {participant
                      ? participant.displayName.slice(0, 1).toUpperCase()
                      : "+"}
                  </span>
                  <div>
                    <strong>
                      {participant?.displayName ?? "Wachten op speler"}
                    </strong>
                    <small>
                      {!participant
                        ? "Gamecode delen om uit te nodigen"
                        : participant.deckReady
                          ? `Deck gereed · ${participant.deckName ?? "Naamloos deck"}`
                          : participant.isHost
                            ? "Host · nog geen deck"
                            : participant.isViewer
                              ? "Jij · kies nog een deck"
                              : "Speler · nog geen deck"}
                    </small>
                  </div>
                  <div className="lobby-seat__badges">
                    {participant?.deckReady ? (
                      <span className="mode-badge mode-badge--ready">
                        Deck gereed
                      </span>
                    ) : null}
                    {participant?.isViewer ? (
                      <span className="mode-badge mode-badge--host">Jij</span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
            {viewer?.role === "player" ? (
              <section
                className="lobby-deck-setup"
                aria-labelledby="lobby-deck-title"
              >
                <div>
                  <span className="eyebrow">Jouw deelname</span>
                  <h3 id="lobby-deck-title">Kies je deck</h3>
                  <p>
                    Alleen de decknaam en gereedstatus zijn zichtbaar in de
                    wachtkamer. Je kaarten gaan rechtstreeks naar de
                    authoritative game.
                  </p>
                </div>
                <div className="lobby-deck-picker">
                  <label>
                    Opgeslagen deck
                    <select
                      value={selectedDeckId}
                      disabled={deckBusy}
                      onChange={event => {
                        setSelectedDeckId(event.target.value)
                      }}
                    >
                      <option value="">Kies een deck…</option>
                      {decks.map(deck => (
                        <option key={deck.deckKey} value={deck.deckKey}>
                          {deck.name} · {deck.cardCount} kaarten
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedDeck ? (
                    <div className="lobby-deck-picker__actions">
                      <button
                        className="button button--primary"
                        type="button"
                        disabled={deckBusy}
                        onClick={() => void registerDeck()}
                      >
                        {deckBusy
                          ? "Even wachten…"
                          : viewer.deckReady &&
                              viewer.deckName === selectedDeck?.name
                            ? "Deck opnieuw registreren"
                            : "Deck gereed"}
                      </button>
                    </div>
                  ) : null}
                </div>
                {!decks.length ? (
                  <div className="lobby-deck-empty">
                    <p>Er staat nog geen deck onder dit account.</p>
                    <p>
                      <AppLink to="/decks">
                        Voeg eerst een deck toe in de Deck Library.
                      </AppLink>
                    </p>
                  </div>
                ) : null}
              </section>
            ) : null}
            {spectators.length ? (
              <p className="lobby-spectators">
                {spectators.length} spectator
                {spectators.length === 1 ? "" : "s"} aanwezig
              </p>
            ) : null}
          </section>

          <aside className="lobby-control-panel">
            <span className="eyebrow">Battle-status</span>
            <span className="lobby-control-panel__orb" aria-hidden="true">
              B
            </span>
            <h2>Wachten op de groep</h2>
            <p>
              De bezetting wordt automatisch bijgewerkt. Zodra de host de battle
              start, gaat iedereen vanzelf door naar het speelveld.
            </p>
            <div className="lobby-progress" aria-hidden="true">
              <span
                style={{
                  width: `${(players.length / room.lobby.maxPlayers) * 100}%`,
                }}
              />
            </div>
            <strong className="lobby-progress-label">
              {openSeats > 0
                ? `Nog ${openSeats} seat${openSeats === 1 ? "" : "s"} vrij`
                : playersWithoutDeck > 0
                  ? `Nog ${playersWithoutDeck} deck${playersWithoutDeck === 1 ? "" : "s"} niet gereed`
                  : "Iedereen is klaar"}
            </strong>

            {isHost ? (
              <div className="lobby-host-actions">
                <button
                  className="button button--primary"
                  type="button"
                  disabled={!canStart}
                  onClick={() => void startBattle()}
                >
                  {starting ? "Battle starten…" : "Battle starten"}
                </button>
                <small>
                  {openSeats > 0
                    ? "Starten kan zodra alle seats bezet zijn."
                    : playersWithoutDeck > 0
                      ? "Starten kan zodra iedere speler een deck gereed heeft gezet."
                      : "Alle spelers en decks zijn gereed."}
                </small>
                {confirmDelete ? (
                  <div className="lobby-delete-confirm" role="alert">
                    <strong>Deze lobby definitief verwijderen?</strong>
                    <div>
                      <button
                        className="button button--secondary"
                        type="button"
                        disabled={deleting}
                        onClick={() => {
                          setConfirmDelete(false)
                        }}
                      >
                        Annuleren
                      </button>
                      <button
                        className="button button--danger"
                        type="button"
                        disabled={deleting}
                        onClick={() => void removeLobby()}
                      >
                        {deleting ? "Verwijderen…" : "Ja, verwijderen"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="lobby-delete-button"
                    type="button"
                    onClick={() => {
                      setConfirmDelete(true)
                    }}
                  >
                    Lobby verwijderen
                  </button>
                )}
              </div>
            ) : (
              <p className="lobby-player-note">
                Je hoeft niets te verversen. Deze pagina volgt de lobby
                automatisch.
              </p>
            )}
          </aside>
        </div>

        {message ? (
          <p className="online-message" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
      </section>
    </AppShell>
  )
}
