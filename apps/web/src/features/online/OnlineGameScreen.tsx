import { openingHandSizeAfterMulligan } from "@mtg/game-core/game"
import {
  DragDropProvider,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/react"
import {
  gameCommandSchema,
  type GameCommand,
  type PersonalGameSnapshot,
  type PublicOnlinePlayer,
  type VisibleOnlineCard,
} from "@mtg/game-protocol"
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { useAppDispatch, useAppSelector } from "../../app/hooks"
import { AppLink } from "../../app/router"
import { Brand } from "../../components/Brand"
import { StatusBar } from "../../components/StatusBar"
import {
  fallbackBattlefieldPosition,
  positionFromDrop,
} from "../battle/battlefieldPosition"
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

const phaseLabels: Record<PersonalGameSnapshot["phase"], string> = {
  beginning: "Beginfase",
  "precombat-main": "Eerste hoofdfase",
  combat: "Gevecht",
  "postcombat-main": "Tweede hoofdfase",
  ending: "Eindfase",
}

const OnlineCard = ({
  card,
  zone,
  canMove,
  compact = false,
  style,
  onMove,
  onToggleTap,
}: {
  card: VisibleOnlineCard
  zone: MoveZone
  canMove: boolean
  compact?: boolean
  style?: CSSProperties
  onMove: (zone: MoveZone) => void
  onToggleTap: () => void
}) => {
  const [actionsOpen, setActionsOpen] = useState(false)
  const { ref, isDragging } = useDraggable({
    id: card.instanceId,
    type: "card",
    data: { instanceId: card.instanceId },
    disabled: !canMove,
  })

  return (
    <div
      ref={ref}
      className={`online-table-card ${
        zone === "battlefield" ? "battlefield-card-position" : ""
      } ${isDragging ? "online-table-card--dragging" : ""}`}
      data-online-draggable={canMove ? "true" : undefined}
      style={style}
      onContextMenu={event => {
        if (!canMove) return
        event.preventDefault()
        setActionsOpen(true)
      }}
    >
      <button
        className={`card ${compact ? "card--compact" : ""} ${
          card.tapped ? "card--tapped" : ""
        }`}
        type="button"
        aria-label={`${card.name}, ${zoneLabels[zone]}${
          card.tapped ? ", getapt" : ""
        }`}
        title={
          zone === "battlefield" && canMove
            ? `${card.name} — dubbelklik om te tappen`
            : card.name
        }
        onDoubleClick={() => {
          if (zone === "battlefield" && canMove) onToggleTap()
        }}
      >
        <span className="card__art">
          {card.imageUrl ? (
            <img src={card.imageUrl} alt="" loading="lazy" />
          ) : (
            <span className="card__fallback">
              <strong>{card.name}</strong>
              {card.typeLine ? <small>{card.typeLine}</small> : null}
            </span>
          )}
        </span>
        {Object.keys(card.counters).length ? (
          <span className="card__counters">
            {Object.entries(card.counters).map(([counter, amount]) => (
              <span key={counter}>
                {counter}: {amount}
              </span>
            ))}
          </span>
        ) : null}
      </button>
      {canMove ? (
        <button
          className="online-table-card__actions-trigger"
          type="button"
          aria-label={`Kaartacties voor ${card.name}`}
          aria-expanded={actionsOpen}
          onClick={() => {
            setActionsOpen(current => !current)
          }}
        >
          ⋮
        </button>
      ) : null}
      {canMove && actionsOpen ? (
        <div className="online-table-card__actions" role="menu">
          <strong>{card.name}</strong>
          {zone === "battlefield" ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onToggleTap()
                setActionsOpen(false)
              }}
            >
              {card.tapped ? "Untappen" : "Tappen"}
            </button>
          ) : null}
          {Object.entries(zoneLabels)
            .filter(([target]) => target !== zone)
            .map(([target, label]) => (
              <button
                key={target}
                type="button"
                role="menuitem"
                onClick={() => {
                  onMove(target as MoveZone)
                  setActionsOpen(false)
                }}
              >
                Naar {label.toLowerCase()}
              </button>
            ))}
        </div>
      ) : null}
    </div>
  )
}

const HiddenHand = ({ count }: { count: number }) => (
  <div className="online-hidden-hand" aria-label={`Verborgen hand: ${count}`}>
    {Array.from({ length: Math.min(count, 9) }, (_, index) => (
      <img
        key={index}
        src="/magic-card-back.webp"
        alt=""
        aria-hidden="true"
        style={{ "--hidden-card-index": index } as CSSProperties}
      />
    ))}
    {count > 9 ? <strong>+{count - 9}</strong> : null}
  </div>
)

const OnlineZone = ({
  title,
  zone,
  cards,
  canMove,
  compact = false,
  hiddenCount,
  playerId,
  onMove,
  onToggleTap,
}: {
  title: string
  zone: MoveZone
  cards: VisibleOnlineCard[]
  canMove: boolean
  compact?: boolean
  hiddenCount?: number
  playerId: string
  onMove: (cardId: string, zone: MoveZone) => void
  onToggleTap: (cardId: string) => void
}) => {
  const { ref, isDropTarget } = useDroppable({
    id: `online-${playerId}-${zone}`,
    type: "zone",
    data: { playerId, zone },
    accept: "card",
    disabled: !canMove,
  })

  return (
    <section
      ref={ref}
      className={`zone zone--${zone} ${
        zone === "command" ? "zone--commander-group" : ""
      } ${isDropTarget ? "zone--drop-target" : ""}`}
      data-online-drop-zone={canMove ? zone : undefined}
      data-online-player-id={canMove ? playerId : undefined}
      aria-label={`${title}, ${hiddenCount ?? cards.length} kaarten`}
    >
      <div className="zone__label">
        <span>{title}</span>
        <strong>{hiddenCount ?? cards.length}</strong>
      </div>
      <div className="zone__cards">
        {hiddenCount !== undefined ? (
          <HiddenHand count={hiddenCount} />
        ) : cards.length ? (
          cards.map((card, index) => {
            const fallbackPosition =
              zone === "battlefield"
                ? {
                    left: `${Math.min(84, 12 + (index % 6) * 14)}%`,
                    top: `${28 + Math.floor(index / 6) * 30}%`,
                    zIndex: index + 1,
                  }
                : undefined
            const position = card.position
              ? {
                  left: `${card.position.x * 100}%`,
                  top: `${card.position.y * 100}%`,
                  zIndex: card.position.z,
                }
              : fallbackPosition
            return (
              <OnlineCard
                key={card.instanceId}
                card={card}
                zone={zone}
                canMove={canMove}
                compact={compact}
                style={position}
                onMove={target => {
                  onMove(card.instanceId, target)
                }}
                onToggleTap={() => {
                  onToggleTap(card.instanceId)
                }}
              />
            )
          })
        ) : (
          <div className="zone__empty">
            {canMove ? "Sleep hierheen" : "Leeg"}
          </div>
        )}
      </div>
    </section>
  )
}

const LibraryStack = ({
  count,
  playerId,
  canMove,
  onCommand,
}: {
  count: number
  playerId: string
  canMove: boolean
  onCommand: (type: GameCommand["type"], payload: unknown) => void
}) => {
  const [actionsOpen, setActionsOpen] = useState(false)
  const { ref, isDropTarget } = useDroppable({
    id: `online-${playerId}-library`,
    type: "zone",
    data: { playerId, zone: "library" },
    accept: "card",
    disabled: !canMove,
  })
  return (
    <section
      ref={ref}
      className={`zone zone--library ${
        isDropTarget ? "zone--drop-target" : ""
      }`}
      data-online-drop-zone={canMove ? "library" : undefined}
      data-online-player-id={canMove ? playerId : undefined}
      aria-label={`Library, ${count} kaarten`}
    >
      <div className="zone__label">
        <span>Library</span>
        <strong>{count}</strong>
        {canMove ? (
          <button
            type="button"
            className="zone__menu-trigger"
            aria-label="Library-acties openen"
            aria-expanded={actionsOpen}
            onClick={() => {
              setActionsOpen(open => !open)
            }}
          >
            ⋮
          </button>
        ) : null}
      </div>
      {actionsOpen ? (
        <div className="online-library-actions" role="menu">
          <button
            type="button"
            role="menuitem"
            disabled={count === 0}
            onClick={() => {
              onCommand("DRAW_CARD", { amount: 1 })
              setActionsOpen(false)
            }}
          >
            Trek kaart
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={count === 0}
            onClick={() => {
              onCommand("MILL", { amount: 1 })
              setActionsOpen(false)
            }}
          >
            Mill 1
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={count < 2}
            onClick={() => {
              onCommand("SHUFFLE_LIBRARY", {})
              setActionsOpen(false)
            }}
          >
            Schud library
          </button>
        </div>
      ) : null}
      <div className="card-stack" aria-hidden="true">
        <span />
        <span />
        {count ? <img src="/magic-card-back.webp" alt="" /> : null}
      </div>
    </section>
  )
}

const OnlinePlayerBoard = ({
  player,
  orientation,
  isActive,
  isSelf,
  ownHand,
  canPlay,
  onCommand,
}: {
  player: PublicOnlinePlayer
  orientation: "opponent" | "self"
  isActive: boolean
  isSelf: boolean
  ownHand: VisibleOnlineCard[] | null
  canPlay: boolean
  onCommand: (type: GameCommand["type"], payload: unknown) => void
}) => {
  const move = (instanceId: string, zone: MoveZone) => {
    onCommand("MOVE_CARD", { instanceId, zone })
  }
  const toggleTap = (instanceId: string) => {
    onCommand("TOGGLE_TAP", { instanceId })
  }
  const canControl = isSelf && canPlay

  return (
    <section
      className={`player-board player-board--${orientation} ${
        isActive ? "player-board--active" : ""
      }`}
      aria-label={`Speelveld van ${player.displayName}`}
    >
      <aside className="player-rail">
        <div>
          <span className="eyebrow">
            {isSelf ? "Jouw speelveld" : "Tegenstander"}
          </span>
          <h2>{player.displayName}</h2>
        </div>
        <div className="player-controls">
          <div className="life-control">
            <button
              type="button"
              disabled={!canControl}
              aria-label={`Leven van ${player.displayName} verlagen`}
              onClick={() => {
                onCommand("CHANGE_LIFE", { delta: -1 })
              }}
            >
              −
            </button>
            <span>
              <strong>{player.life}</strong>
              <small>leven</small>
            </span>
            <button
              type="button"
              disabled={!canControl}
              aria-label={`Leven van ${player.displayName} verhogen`}
              onClick={() => {
                onCommand("CHANGE_LIFE", { delta: 1 })
              }}
            >
              +
            </button>
          </div>
          <div className="status-counter">
            <span>Poison</span>
            <button
              type="button"
              disabled={!canControl || player.poison === 0}
              onClick={() => {
                onCommand("CHANGE_POISON", { delta: -1 })
              }}
            >
              −
            </button>
            <strong>{player.poison}</strong>
            <button
              type="button"
              disabled={!canControl}
              onClick={() => {
                onCommand("CHANGE_POISON", { delta: 1 })
              }}
            >
              +
            </button>
          </div>
          <small className="online-player-counts">
            Hand {player.handCount} · Library {player.libraryCount}
          </small>
        </div>
      </aside>

      <div className="board-surface">
        <div className="edge-zones">
          <OnlineZone
            title="Command"
            zone="command"
            playerId={player.id}
            cards={player.command}
            canMove={canControl}
            compact
            onMove={move}
            onToggleTap={toggleTap}
          />
        </div>
        <OnlineZone
          title="Battlefield"
          zone="battlefield"
          playerId={player.id}
          cards={player.battlefield}
          canMove={canControl}
          onMove={move}
          onToggleTap={toggleTap}
        />
        <OnlineZone
          title={isSelf ? "Hand" : "Verborgen hand"}
          zone="hand"
          playerId={player.id}
          cards={ownHand ?? []}
          hiddenCount={isSelf ? undefined : player.handCount}
          canMove={canControl}
          compact
          onMove={move}
          onToggleTap={toggleTap}
        />
      </div>

      <aside className="pile-rail">
        <LibraryStack
          count={player.libraryCount}
          playerId={player.id}
          canMove={canControl}
          onCommand={onCommand}
        />
        <OnlineZone
          title="Graveyard"
          zone="graveyard"
          playerId={player.id}
          cards={player.graveyard}
          canMove={canControl}
          compact
          onMove={move}
          onToggleTap={toggleTap}
        />
        <OnlineZone
          title="Exile"
          zone="exile"
          playerId={player.id}
          cards={player.exile}
          canMove={canControl}
          compact
          onMove={move}
          onToggleTap={toggleTap}
        />
      </aside>
    </section>
  )
}

const OnlineOpeningHand = ({
  view,
  ownPlayerId,
  busy,
  onCommand,
}: {
  view: PersonalGameSnapshot
  ownPlayerId: string | null
  busy: boolean
  onCommand: (type: GameCommand["type"], payload: unknown) => void
}) => {
  const waitingPlayers = view.turnOrder.filter(
    playerId => !view.openingHands[playerId]?.kept,
  )
  if (waitingPlayers.length === 0) return null
  const ownState = ownPlayerId ? view.openingHands[ownPlayerId] : null
  const ownPlayer = ownPlayerId ? view.players[ownPlayerId] : null
  const cards = view.privateView?.hand ?? []

  if (!ownPlayerId || !ownState || !ownPlayer) {
    return (
      <div className="opening-hand-layer">
        <section
          className="opening-hand-dialog online-opening-wait"
          role="dialog"
        >
          <span className="eyebrow">Openingshanden</span>
          <h2>Wachten op de spelers</h2>
          <p>
            {waitingPlayers.length} speler
            {waitingPlayers.length === 1 ? "" : "s"} kiezen nog een hand.
          </p>
        </section>
      </div>
    )
  }

  if (ownState.kept) {
    return (
      <div className="opening-hand-layer">
        <section
          className="opening-hand-dialog online-opening-wait"
          role="dialog"
        >
          <span className="eyebrow">Jouw hand staat vast</span>
          <h2>Wachten op de rest van de tafel</h2>
          <p>
            {waitingPlayers
              .map(playerId => view.players[playerId]?.displayName)
              .filter(Boolean)
              .join(", ")}{" "}
            {waitingPlayers.length === 1 ? "kiest" : "kiezen"} nog een
            openingshand.
          </p>
        </section>
      </div>
    )
  }

  const nextHandSize = openingHandSizeAfterMulligan(ownState.mulliganCount + 1)
  const playerNumber = view.turnOrder.indexOf(ownPlayerId) + 1
  return (
    <div className="opening-hand-layer">
      <section
        className="opening-hand-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="online-opening-hand-title"
      >
        <header>
          <div>
            <span className="eyebrow">
              Speler {playerNumber} van {view.turnOrder.length}
            </span>
            <h2 id="online-opening-hand-title">
              Openingshand van {ownPlayer.displayName}
            </h2>
          </div>
          <div className="opening-hand-dialog__count" aria-live="polite">
            <strong>{cards.length}</strong>
            <span>kaarten</span>
          </div>
        </header>
        <p className="opening-hand-dialog__rule">
          De eerste twee mulligans blijven op zeven kaarten. Vanaf de derde
          mulligan krijg je telkens één kaart minder.
        </p>
        <div
          className="opening-hand-dialog__cards"
          aria-label={`Openingshand met ${cards.length} kaarten`}
        >
          {cards.map(card => (
            <OnlineCard
              key={card.instanceId}
              card={card}
              zone="hand"
              canMove={false}
              onMove={() => undefined}
              onToggleTap={() => undefined}
            />
          ))}
        </div>
        <footer>
          <div className="opening-hand-dialog__mulligan">
            <button
              className="button button--secondary"
              type="button"
              disabled={busy || cards.length === 0}
              onClick={() => {
                onCommand("MULLIGAN_HAND", {})
              }}
            >
              Mulligan ({ownState.mulliganCount})
            </button>
            <span>Nieuwe hand: {nextHandSize} kaarten</span>
          </div>
          <button
            className="button button--primary button--large"
            type="button"
            disabled={busy}
            onClick={() => {
              onCommand("KEEP_HAND", {})
            }}
          >
            Deze hand houden
          </button>
        </footer>
      </section>
    </div>
  )
}

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
  const openingHandsKept =
    view?.turnOrder.every(playerId => view.openingHands[playerId]?.kept) ??
    false
  const canPlay =
    view?.role === "player" &&
    ownPlayerId !== null &&
    openingHandsKept &&
    online.connectionStatus === "connected" &&
    online.pendingCommandIds.length === 0
  const orderedPlayerIds = view
    ? [
        ...view.turnOrder.filter(playerId => playerId !== ownPlayerId),
        ...(ownPlayerId ? [ownPlayerId] : []),
      ]
    : []

  const handleDragEnd = (event: DragEndEvent) => {
    if (event.canceled || !view || !ownPlayerId || !canPlay) return
    const sourceData = event.operation.source?.data
    const targetData = event.operation.target?.data
    const pointer =
      event.nativeEvent instanceof MouseEvent
        ? { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY }
        : null
    const fallbackTarget = pointer
      ? document.elementsFromPoint(pointer.x, pointer.y).flatMap(element => {
          const zone = element.closest<HTMLElement>(
            "[data-online-drop-zone][data-online-player-id]",
          )
          return zone ? [zone] : []
        })[0]
      : null
    const targetPlayerId =
      typeof targetData?.playerId === "string"
        ? targetData.playerId
        : fallbackTarget?.dataset.onlinePlayerId
    const targetZoneValue =
      typeof targetData?.zone === "string"
        ? targetData.zone
        : fallbackTarget?.dataset.onlineDropZone
    if (
      typeof sourceData?.instanceId !== "string" ||
      targetPlayerId !== ownPlayerId ||
      typeof targetZoneValue !== "string"
    ) {
      return
    }
    const targetZone = targetZoneValue as MoveZone
    const ownPlayer = view.players[ownPlayerId]
    const battlefieldSurface =
      targetZone === "battlefield"
        ? (
            event.operation.target?.element ?? fallbackTarget
          )?.querySelector<HTMLElement>(".zone__cards")
        : null
    const cardBounds = event.operation.shape?.current.boundingRectangle
    const nextZ =
      Math.max(
        0,
        ...(ownPlayer?.battlefield.map(card => card.position?.z ?? 0) ?? []),
      ) + 1
    const position =
      targetZone === "battlefield" && battlefieldSurface && cardBounds
        ? positionFromDrop(
            cardBounds,
            battlefieldSurface.getBoundingClientRect(),
            nextZ,
          )
        : targetZone === "battlefield"
          ? fallbackBattlefieldPosition(
              ownPlayer?.battlefield.length ?? 0,
              (ownPlayer?.battlefield.length ?? 0) + 1,
            )
          : undefined
    sendCommand("MOVE_CARD", {
      instanceId: sourceData.instanceId,
      zone: targetZone,
      position,
    })
  }

  return (
    <main className="battle-screen online-battle-screen">
      <header className="battle-header">
        <AppLink to="/" className="brand-link">
          <Brand />
        </AppLink>
        <div className="battle-title">
          <span className="eyebrow">Online battle</span>
          <strong>
            {view
              ? view.turnOrder
                  .map(playerId => view.players[playerId]?.displayName)
                  .filter(Boolean)
                  .join(" vs. ")
              : `Game ${gameId}`}
          </strong>
        </div>
        <StatusBar
          onlineStateLabel={
            view
              ? `Serverstate v${view.version}`
              : `Verbinding ${online.connectionStatus}`
          }
        />
        <nav className="battle-actions" aria-label="Online battleacties">
          <button
            className="button button--ghost"
            type="button"
            onClick={() => {
              connectionRef.current?.reconnect()
            }}
          >
            Opnieuw verbinden
          </button>
          <AppLink to="/online" className="button button--ghost">
            Lobby’s
          </AppLink>
        </nav>
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
        <div className="empty-state online-game-loading" aria-live="polite">
          <strong>Persoonlijke snapshot laden…</strong>
          <span>
            Verbinding {online.connectionStatus}. Verborgen kaarten worden
            uitsluitend in jouw persoonlijke view geladen.
          </span>
        </div>
      ) : (
        <DragDropProvider onDragEnd={handleDragEnd}>
          {view.role === "spectator" ? (
            <p className="online-spectator-note">
              Spectatormodus: je ziet uitsluitend publieke informatie.
            </p>
          ) : null}

          <div
            className={`battle-table online-battle-table online-battle-table--${view.turnOrder.length}`}
          >
            {orderedPlayerIds.map((playerId, index) => {
              const player = view.players[playerId]
              if (!player) return null
              const isSelf = playerId === ownPlayerId
              return (
                <div key={playerId}>
                  {isSelf && index > 0 ? (
                    <div className="table-divider">
                      <div className="match-status online-match-status">
                        <div className="match-status__turn">
                          <span className="eyebrow">Aan de beurt</span>
                          <strong>
                            {view.players[view.activePlayerId]?.displayName}
                          </strong>
                          <small>
                            Beurt {view.turnNumber} · {phaseLabels[view.phase]}
                          </small>
                        </div>
                        <label>
                          <span>Monarch</span>
                          <select
                            aria-label="Monarch-houder"
                            disabled={!canPlay}
                            value={view.matchStatus.monarchPlayerId ?? "none"}
                            onChange={event => {
                              sendCommand("SET_MONARCH", {
                                playerId:
                                  event.target.value === "none"
                                    ? null
                                    : event.target.value,
                              })
                            }}
                          >
                            <option value="none">Niemand</option>
                            {view.turnOrder.map(playerId => (
                              <option key={playerId} value={playerId}>
                                {view.players[playerId]?.displayName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Initiative</span>
                          <select
                            aria-label="Initiative-houder"
                            disabled={!canPlay}
                            value={
                              view.matchStatus.initiativePlayerId ?? "none"
                            }
                            onChange={event => {
                              sendCommand("SET_INITIATIVE", {
                                playerId:
                                  event.target.value === "none"
                                    ? null
                                    : event.target.value,
                              })
                            }}
                          >
                            <option value="none">Niemand</option>
                            {view.turnOrder.map(playerId => (
                              <option key={playerId} value={playerId}>
                                {view.players[playerId]?.displayName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Dag / nacht</span>
                          <select
                            aria-label="Dag- en nachtstatus"
                            disabled={!canPlay}
                            value={view.matchStatus.dayNight}
                            onChange={event => {
                              sendCommand("SET_DAY_NIGHT", {
                                status: event.target.value,
                              })
                            }}
                          >
                            <option value="none">Geen</option>
                            <option value="day">Dag</option>
                            <option value="night">Nacht</option>
                          </select>
                        </label>
                        <div className="match-status__actions">
                          <button
                            type="button"
                            disabled={
                              !canPlay || view.activePlayerId !== ownPlayerId
                            }
                            onClick={() => {
                              sendCommand("NEXT_PHASE", {})
                            }}
                          >
                            Volgende fase
                          </button>
                          <button
                            type="button"
                            disabled={
                              !canPlay || view.activePlayerId !== ownPlayerId
                            }
                            onClick={() => {
                              sendCommand("PASS_TURN", {})
                            }}
                          >
                            Volgende beurt →
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <OnlinePlayerBoard
                    player={player}
                    orientation={isSelf ? "self" : "opponent"}
                    isActive={view.activePlayerId === playerId}
                    isSelf={isSelf}
                    ownHand={isSelf ? (view.privateView?.hand ?? []) : null}
                    canPlay={canPlay}
                    onCommand={sendCommand}
                  />
                </div>
              )
            })}
          </div>

          <OnlineOpeningHand
            view={view}
            ownPlayerId={ownPlayerId}
            busy={online.pendingCommandIds.length > 0}
            onCommand={sendCommand}
          />
        </DragDropProvider>
      )}
    </main>
  )
}
