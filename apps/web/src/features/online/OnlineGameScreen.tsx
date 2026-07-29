import { useEffect, useRef } from "react"
import { useAppDispatch, useAppSelector } from "../../app/hooks"
import { AppLink } from "../../app/router"
import { AppShell } from "../../components/AppShell"
import {
  gameCommandSchema,
  type GameCommand,
  type PublicOnlinePlayer,
  type VisibleOnlineCard,
} from "@mtg/game-protocol"
import {
  beginOnlineConnection,
  clearOnlineGame,
  queueOnlineCommand,
  receiveOnlineEvent,
  setOnlineConnectionError,
  setOnlineConnectionStatus,
} from "./onlineSlice"
import type { OnlineGameConnection, OnlineGameService } from "./types"

type OnlineGameScreenProps = {
  gameId: string
  onlineGames: OnlineGameService
}

const zoneLabels = {
  hand: "Hand",
  battlefield: "Battlefield",
  graveyard: "Graveyard",
  exile: "Exile",
  command: "Command zone",
  library: "Library",
} as const

type MoveZone = keyof typeof zoneLabels

const CardTile = ({
  card,
  canMove,
  onMove,
}: {
  card: VisibleOnlineCard
  canMove: boolean
  onMove: (zone: MoveZone) => void
}) => (
  <article className="online-card">
    {card.imageUrl ? (
      <img src={card.imageUrl} alt={card.name} loading="lazy" />
    ) : (
      <div className="online-card__fallback" aria-hidden="true">
        {card.name.slice(0, 1)}
      </div>
    )}
    <div>
      <strong>{card.name}</strong>
      {card.typeLine ? <small>{card.typeLine}</small> : null}
    </div>
    {canMove ? (
      <label>
        <span className="sr-only">Verplaats {card.name}</span>
        <select
          aria-label={`Verplaats ${card.name}`}
          defaultValue=""
          onChange={event => {
            if (!event.target.value) return
            onMove(event.target.value as MoveZone)
            event.target.value = ""
          }}
        >
          <option value="" disabled>
            Verplaats…
          </option>
          {Object.entries(zoneLabels).map(([zone, label]) => (
            <option key={zone} value={zone}>
              Naar {label}
            </option>
          ))}
        </select>
      </label>
    ) : null}
  </article>
)

const PublicZone = ({
  title,
  cards,
  canMove,
  onMove,
}: {
  title: string
  cards: VisibleOnlineCard[]
  canMove: boolean
  onMove: (cardId: string, zone: MoveZone) => void
}) => (
  <section className="online-zone">
    <h4>
      {title} <span>{cards.length}</span>
    </h4>
    {cards.length ? (
      <div className="online-zone__cards">
        {cards.map(card => (
          <CardTile
            key={card.instanceId}
            card={card}
            canMove={canMove}
            onMove={zone => {
              onMove(card.instanceId, zone)
            }}
          />
        ))}
      </div>
    ) : (
      <p>Leeg</p>
    )}
  </section>
)

const PlayerPanel = ({
  player,
  isActive,
  isSelf,
  ownHand,
  onMove,
}: {
  player: PublicOnlinePlayer
  isActive: boolean
  isSelf: boolean
  ownHand: VisibleOnlineCard[] | null
  onMove: (cardId: string, zone: MoveZone) => void
}) => (
  <article
    className={`online-player ${isActive ? "is-active" : ""}`}
    aria-label={`Online speelveld van ${player.displayName}`}
  >
    <header>
      <div>
        <span className="eyebrow">
          {isSelf ? "Jouw persoonlijke view" : "Publieke tegenstander"}
        </span>
        <h3>{player.displayName}</h3>
      </div>
      <div className="online-player__vitals">
        <strong>{player.life}</strong>
        <span>leven</span>
        <strong>{player.poison}</strong>
        <span>poison</span>
      </div>
    </header>
    <div className="online-player__hidden-counts">
      <span>Hand: {player.handCount}</span>
      <span>Library: {player.libraryCount}</span>
    </div>
    {ownHand ? (
      <PublicZone title="Eigen hand" cards={ownHand} canMove onMove={onMove} />
    ) : null}
    <div className="online-player__zones">
      <PublicZone
        title="Battlefield"
        cards={player.battlefield}
        canMove={isSelf}
        onMove={onMove}
      />
      <PublicZone
        title="Graveyard"
        cards={player.graveyard}
        canMove={isSelf}
        onMove={onMove}
      />
      <PublicZone
        title="Exile"
        cards={player.exile}
        canMove={isSelf}
        onMove={onMove}
      />
      <PublicZone
        title="Command"
        cards={player.command}
        canMove={isSelf}
        onMove={onMove}
      />
    </div>
  </article>
)

export const OnlineGameScreen = ({
  gameId,
  onlineGames,
}: OnlineGameScreenProps) => {
  const dispatch = useAppDispatch()
  const online = useAppSelector(state => state.online)
  const connectionRef = useRef<OnlineGameConnection | null>(null)

  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined
    dispatch(beginOnlineConnection(gameId))
    void onlineGames
      .connectGame(gameId)
      .then(connection => {
        if (disposed) {
          connection.close()
          return
        }
        connectionRef.current = connection
        unsubscribe = connection.subscribe(update => {
          if (update.type === "event") {
            dispatch(receiveOnlineEvent(update.event))
            return
          }
          dispatch(setOnlineConnectionStatus(update.status))
          if (update.status === "error") {
            dispatch(
              setOnlineConnectionError({
                code: "INTERNAL_ERROR",
                message: update.message ?? "De online verbinding is verbroken.",
                retryable: true,
              }),
            )
          }
        })
      })
      .catch((error: unknown) => {
        dispatch(
          setOnlineConnectionError({
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error
                ? error.message
                : "De online game kon niet worden verbonden.",
            retryable: true,
          }),
        )
      })

    return () => {
      disposed = true
      unsubscribe?.()
      connectionRef.current?.close()
      connectionRef.current = null
      dispatch(clearOnlineGame())
    }
  }, [dispatch, gameId, onlineGames])

  const sendCommand = (type: GameCommand["type"], payload: unknown) => {
    const view = online.view
    const connection = connectionRef.current
    if (!view || !connection) return
    const command = gameCommandSchema.parse({
      type,
      commandId: crypto.randomUUID(),
      expectedVersion: view.version,
      payload,
    })
    dispatch(queueOnlineCommand(command.commandId))
    try {
      connection.send(command)
    } catch (error) {
      dispatch(
        setOnlineConnectionError({
          code: "INTERNAL_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Command versturen is mislukt.",
          retryable: true,
        }),
      )
    }
  }

  const view = online.view
  const ownPlayerId = view?.privateView?.playerId ?? null
  const canPlay =
    view?.role === "player" &&
    ownPlayerId !== null &&
    online.connectionStatus === "connected"

  return (
    <AppShell activeRoute="/online">
      <section className="online-game-page">
        <header className="online-game-header">
          <div>
            <span className="eyebrow">Persoonlijke serverview</span>
            <h1>Online battle</h1>
            <p>
              Game {gameId} · verbinding {online.connectionStatus}
              {view
                ? ` · versie ${view.version} · beurt ${view.turnNumber}`
                : ""}
            </p>
          </div>
          <div className="online-game-header__actions">
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                connectionRef.current?.reconnect()
              }}
            >
              Opnieuw verbinden
            </button>
            <AppLink to="/online" className="button button--secondary">
              Lobby’s
            </AppLink>
          </div>
        </header>

        {online.lastError ? (
          <p className="online-message" role="alert">
            {online.lastError.message}
            {online.lastError.code === "VERSION_CONFLICT"
              ? " De persoonlijke state is opnieuw gesynchroniseerd."
              : ""}
          </p>
        ) : null}

        {!view ? (
          <div className="empty-state" aria-live="polite">
            <strong>Persoonlijke snapshot laden…</strong>
            <span>
              Na iedere reconnect wordt eerst een volledige verse serverview
              opgehaald.
            </span>
          </div>
        ) : (
          <>
            <section className="online-game-controls" aria-label="Gameacties">
              <button
                type="button"
                disabled={!canPlay}
                onClick={() => {
                  sendCommand("DRAW_CARD", { amount: 1 })
                }}
              >
                Trek kaart
              </button>
              <button
                type="button"
                disabled={!canPlay}
                onClick={() => {
                  sendCommand("MILL", { amount: 1 })
                }}
              >
                Mill 1
              </button>
              <button
                type="button"
                disabled={!canPlay}
                onClick={() => {
                  sendCommand("SHUFFLE_LIBRARY", {})
                }}
              >
                Schud library
              </button>
              <button
                type="button"
                disabled={!canPlay}
                onClick={() => {
                  sendCommand("CHANGE_LIFE", { delta: -1 })
                }}
              >
                Leven −1
              </button>
              <button
                type="button"
                disabled={!canPlay}
                onClick={() => {
                  sendCommand("CHANGE_LIFE", { delta: 1 })
                }}
              >
                Leven +1
              </button>
              <button
                type="button"
                disabled={!canPlay}
                onClick={() => {
                  sendCommand("CHANGE_POISON", { delta: 1 })
                }}
              >
                Poison +1
              </button>
              <button
                type="button"
                disabled={!canPlay || view.activePlayerId !== ownPlayerId}
                onClick={() => {
                  sendCommand("PASS_TURN", {})
                }}
              >
                Beurt doorgeven
              </button>
              <span aria-live="polite">
                {online.pendingCommandIds.length
                  ? `${online.pendingCommandIds.length} command(s) wachten`
                  : "Serverstate bijgewerkt"}
              </span>
            </section>

            {view.role === "spectator" ? (
              <p className="online-spectator-note">
                Spectatormodus: je ontvangt uitsluitend publieke informatie en
                kunt geen commands uitvoeren.
              </p>
            ) : null}

            <section
              className={`online-players online-players--${view.turnOrder.length}`}
              aria-label="Online Commander-tafel"
            >
              {view.turnOrder.map(playerId => {
                const player = view.players[playerId]
                if (!player) return null
                const isSelf = playerId === ownPlayerId
                return (
                  <PlayerPanel
                    key={playerId}
                    player={player}
                    isActive={view.activePlayerId === playerId}
                    isSelf={isSelf}
                    ownHand={isSelf ? (view.privateView?.hand ?? null) : null}
                    onMove={(cardId, zone) => {
                      sendCommand("MOVE_CARD", {
                        instanceId: cardId,
                        zone,
                      })
                    }}
                  />
                )
              })}
            </section>
          </>
        )}
      </section>
    </AppShell>
  )
}
