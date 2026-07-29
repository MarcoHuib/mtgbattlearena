import { openingHandSizeAfterMulligan } from "@mtg/game-core/game"
import type {
  BattlefieldPosition,
  OptionalPlayerTracker,
} from "@mtg/game-core/types"
import { Feedback } from "@dnd-kit/dom"
import {
  DragDropProvider,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/react"
import {
  gameCommandSchema,
  type GameCommand,
  type PersonalGameSnapshot,
  type OnlineTokenDefinition,
  type PublicOnlinePlayer,
  type VisibleOnlineCard,
} from "@mtg/game-protocol"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import { createPortal } from "react-dom"
import { useAppDispatch, useAppSelector } from "../../app/hooks"
import { AppLink, navigate } from "../../app/router"
import { Brand } from "../../components/Brand"
import { StatusBar } from "../../components/StatusBar"
import { repositories } from "../../persistence/database"
import {
  cardBoundsAtPointer,
  correctionForRelativePoint,
  dragAnchorFromPointer,
  dragAnchorFromRelativePoint,
  fallbackBattlefieldPosition,
  positionFromDrop,
  type DragAnchor,
} from "../battle/battlefieldPosition"
import { beginCardPointerSession } from "../battle/cardPointerSession"
import {
  beginOnlineConnection,
  clearOnlineGame,
  queueOnlineCommand,
  receiveOnlineEvent,
  setOnlineConnectionError,
  setOnlineConnectionStatus,
} from "./onlineSlice"
import { positionForViewer } from "./onlineBattlefieldPosition"
import { findOnlineDropTarget } from "./onlineDropTarget"
import type { OnlineGameConnection, OnlineGameService } from "./types"
import { useDismissibleMenu } from "./useDismissibleMenu"

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

const trackerLabels: Record<OptionalPlayerTracker, string> = {
  energy: "Energy",
  experience: "Experience",
  rad: "Rad",
}

const optionalTrackers = Object.keys(trackerLabels) as OptionalPlayerTracker[]

type MoveZone = keyof typeof zoneLabels

type MenuPoint = {
  x: number
  y: number
}

type OnlineActionMenu =
  | {
      kind: "card"
      instanceId: string
      name: string
      zone: MoveZone
      tapped: boolean
      point: MenuPoint
    }
  | {
      kind: "library"
      count: number
      point: MenuPoint
    }
  | {
      kind: "battlefield"
      point: MenuPoint
      position: BattlefieldPosition
    }

const phaseLabels: Record<PersonalGameSnapshot["phase"], string> = {
  beginning: "Beginfase",
  "precombat-main": "Eerste hoofdfase",
  combat: "Gevecht",
  "postcombat-main": "Tweede hoofdfase",
  ending: "Eindfase",
}

const ONLINE_CARD_DRAG_PLUGINS = [
  Feedback.configure({
    dropAnimation: null,
  }),
]

const getOnlineMenuStyle = (
  { x, y }: MenuPoint,
  requestedWidth: number,
  estimatedHeight: number,
): CSSProperties => {
  const width = Math.min(requestedWidth, window.innerWidth - 24)
  const top = Math.max(
    12,
    Math.min(y + 8, window.innerHeight - estimatedHeight - 12),
  )
  const left =
    x + width + 12 <= window.innerWidth
      ? x
      : Math.max(12, window.innerWidth - width - 12)

  return { top, left, width }
}

const pointerFromEvent = (event: Event | null | undefined) =>
  event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : null

const transformScale = (element: Element) => {
  const transform = getComputedStyle(element).transform
  if (transform === "none") return { x: 1, y: 1 }
  const matrix = new DOMMatrixReadOnly(transform)
  return {
    x: Math.hypot(matrix.a, matrix.b) || 1,
    y: Math.hypot(matrix.c, matrix.d) || 1,
  }
}

const OnlineActionMenuPortal = ({
  menu,
  tokenDefinitions,
  onClose,
  onMove,
  onToggleTap,
  onZoneCommand,
  onCreateToken,
  onBrowseLibrary,
}: {
  menu: OnlineActionMenu | null
  tokenDefinitions: OnlineTokenDefinition[]
  onClose: () => void
  onMove: (instanceId: string, zone: MoveZone) => void
  onToggleTap: (instanceId: string) => void
  onZoneCommand: (
    type: "DRAW_CARD" | "MILL" | "SHUFFLE_LIBRARY" | "UNTAP_ALL",
    amount?: number,
  ) => void
  onCreateToken: (
    token: OnlineTokenDefinition,
    position: BattlefieldPosition,
  ) => void
  onBrowseLibrary: (options: { search?: boolean; amount: number }) => void
}) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const [amount, setAmount] = useState(1)
  const [showTokens, setShowTokens] = useState(true)
  useDismissibleMenu({
    open: menu !== null,
    boundaryRef: menuRef,
    onDismiss: onClose,
  })

  if (!menu) return null
  const normalizedAmount = Math.max(1, Math.min(20, Math.floor(amount) || 1))

  return createPortal(
    menu.kind === "card" ? (
      <section
        ref={menuRef}
        className="card-action-menu online-card-action-menu"
        style={getOnlineMenuStyle(menu.point, 310, 330)}
        role="dialog"
        aria-label={`Kaartacties voor ${menu.name}`}
      >
        <header>
          <div>
            <span className="eyebrow">Kaartacties</span>
            <strong>{menu.name}</strong>
          </div>
          <button
            type="button"
            aria-label="Kaartacties sluiten"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {menu.zone === "battlefield" ? (
          <button
            className="card-action-menu__primary"
            type="button"
            onClick={() => {
              onToggleTap(menu.instanceId)
              onClose()
            }}
          >
            <span>↻</span>
            {menu.tapped ? "Untappen" : "Tappen"}
          </button>
        ) : null}
        <label className="card-action-menu__move">
          <span>Verplaats kaart</span>
          <select
            aria-label={`Verplaats ${menu.name}`}
            defaultValue=""
            onChange={event => {
              if (!event.target.value) return
              onMove(menu.instanceId, event.target.value as MoveZone)
              onClose()
            }}
          >
            <option value="" disabled>
              Kies een zone…
            </option>
            {Object.entries(zoneLabels)
              .filter(([target]) => target !== menu.zone)
              .map(([target, label]) => (
                <option key={target} value={target}>
                  Naar {label.toLowerCase()}
                </option>
              ))}
          </select>
        </label>
      </section>
    ) : (
      <section
        ref={menuRef}
        className="zone-action-menu online-zone-action-menu"
        style={getOnlineMenuStyle(menu.point, 360, 560)}
        role="dialog"
        aria-label={
          menu.kind === "library" ? "Libraryacties" : "Battlefieldacties"
        }
      >
        <header>
          <strong>
            {menu.kind === "library" ? "Libraryacties" : "Tafelacties"}
          </strong>
          <button
            type="button"
            aria-label="Actiemenu sluiten"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {menu.kind === "library" ? (
          <>
            <button
              type="button"
              disabled={menu.count === 0}
              onClick={() => {
                onZoneCommand("DRAW_CARD", 1)
                onClose()
              }}
            >
              <span aria-hidden="true">→</span> Trek een kaart
            </button>
            <div className="zone-action-menu__amount">
              <label>
                <span>Aantal</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={amount}
                  onChange={event => {
                    setAmount(event.target.valueAsNumber || 1)
                  }}
                />
              </label>
              <button
                type="button"
                disabled={menu.count === 0}
                onClick={() => {
                  onZoneCommand("DRAW_CARD", normalizedAmount)
                  onClose()
                }}
              >
                Trek X
              </button>
              <button
                type="button"
                disabled={menu.count === 0}
                onClick={() => {
                  onZoneCommand("MILL", normalizedAmount)
                  onClose()
                }}
              >
                Mill X
              </button>
            </div>
            <div className="zone-action-menu__separator" />
            <button
              type="button"
              disabled={menu.count === 0}
              onClick={() => {
                onBrowseLibrary({ amount: menu.count })
                onClose()
              }}
            >
              <span aria-hidden="true">▦</span> Bekijk library
            </button>
            <button
              type="button"
              disabled={menu.count === 0}
              onClick={() => {
                onBrowseLibrary({ search: true, amount: menu.count })
                onClose()
              }}
            >
              <span aria-hidden="true">⌕</span> Zoek library
            </button>
            <button
              type="button"
              disabled={menu.count === 0}
              onClick={() => {
                onBrowseLibrary({ amount: normalizedAmount })
                onClose()
              }}
            >
              <span aria-hidden="true">◉</span> Bekijk bovenste X
            </button>
            <button
              type="button"
              disabled={menu.count < 2}
              onClick={() => {
                onZoneCommand("SHUFFLE_LIBRARY")
                onClose()
              }}
            >
              <span aria-hidden="true">⤨</span> Schud library
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                onZoneCommand("UNTAP_ALL")
                onClose()
              }}
            >
              <span aria-hidden="true">↶</span> Untap alles
            </button>
            <button
              type="button"
              aria-expanded={showTokens}
              onClick={() => {
                setShowTokens(value => !value)
              }}
            >
              <span aria-hidden="true">＋</span> Token toevoegen
              <span aria-hidden="true">{showTokens ? "▾" : "▸"}</span>
            </button>
            {showTokens ? (
              <div className="zone-action-menu__tokens">
                {tokenDefinitions.map(token => (
                  <button
                    type="button"
                    key={token.definitionId}
                    onClick={() => {
                      onCreateToken(token, menu.position)
                      onClose()
                    }}
                  >
                    {token.imageUrl ? (
                      <img
                        src={token.imageUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="zone-action-menu__token-fallback">
                        {token.name.slice(0, 1)}
                      </span>
                    )}
                    <span>
                      <strong>{token.name}</strong>
                      <small>
                        {token.power === undefined ||
                        token.toughness === undefined
                          ? ""
                          : `${token.power}/${token.toughness}`}
                      </small>
                    </span>
                  </button>
                ))}
                {tokenDefinitions.length === 0 ? (
                  <p>
                    Voor dit deck zijn geen bekende tokenkaarten meegeleverd.
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </section>
    ),
    document.body,
  )
}

const OnlinePublicZoneBrowser = ({
  title,
  playerName,
  cards,
  canMove,
  initialSearch = false,
  onMove,
  onClose,
}: {
  title: "Library" | "Graveyard" | "Exile"
  playerName: string
  cards: VisibleOnlineCard[]
  canMove: boolean
  initialSearch?: boolean
  onMove: (instanceId: string, zone: MoveZone) => void
  onClose: () => void
}) => {
  const [query, setQuery] = useState("")
  const dialogRef = useRef<HTMLDivElement>(null)
  const visibleCards = cards.filter(card => {
    const search = query.trim().toLowerCase()
    return (
      !search ||
      card.name.toLowerCase().includes(search) ||
      card.typeLine?.toLowerCase().includes(search)
    )
  })

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", closeOnEscape)
    dialogRef.current?.focus()
    return () => {
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [onClose])

  return createPortal(
    <div
      className="zone-browser-layer"
      onPointerDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="zone-browser online-zone-browser"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} van ${playerName}`}
        tabIndex={-1}
      >
        <header>
          <div>
            <span className="eyebrow">{playerName}</span>
            <h2>{title} bekijken</h2>
          </div>
          <button
            type="button"
            aria-label="Zonebrowser sluiten"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="zone-browser__tools">
          <label>
            <span>Zoeken</span>
            <input
              autoFocus={initialSearch}
              value={query}
              placeholder="Kaartnaam of type"
              onChange={event => {
                setQuery(event.target.value)
              }}
            />
          </label>
          <span>
            {visibleCards.length} van {cards.length} kaarten
          </span>
        </div>
        <div className="zone-browser__cards zone-browser__cards--grid">
          {visibleCards.map(card => (
            <article className="zone-browser__item" key={card.instanceId}>
              <div className="online-zone-browser-card">
                {card.imageUrl ? (
                  <img src={card.imageUrl} alt={card.name} loading="lazy" />
                ) : (
                  <span>{card.name}</span>
                )}
              </div>
              <div>
                <strong>{card.name}</strong>
                <small>{card.typeLine}</small>
                {canMove ? (
                  <select
                    aria-label={`Verplaats ${card.name}`}
                    defaultValue=""
                    onChange={event => {
                      if (!event.target.value) return
                      onMove(card.instanceId, event.target.value as MoveZone)
                      onClose()
                    }}
                  >
                    <option value="" disabled>
                      Verplaats…
                    </option>
                    {Object.entries(zoneLabels)
                      .filter(([, label]) => label !== title)
                      .map(([zone, label]) => (
                        <option value={zone} key={zone}>
                          Naar {label.toLowerCase()}
                        </option>
                      ))}
                  </select>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

const OnlineCard = ({
  card,
  zone,
  canMove,
  compact = false,
  style,
  actionsOpen,
  onOpenActions,
  onCloseActions,
  onToggleTap,
}: {
  card: VisibleOnlineCard
  zone: MoveZone
  canMove: boolean
  compact?: boolean
  style?: CSSProperties
  actionsOpen: boolean
  onOpenActions: (point: MenuPoint) => void
  onCloseActions: () => void
  onToggleTap: () => void
}) => {
  const [pointerHeld, setPointerHeld] = useState(false)
  const { ref, isDragging } = useDraggable({
    id: card.instanceId,
    type: "card",
    data: { instanceId: card.instanceId },
    disabled: !canMove,
    plugins: ONLINE_CARD_DRAG_PLUGINS,
  })

  useEffect(() => {
    if (!pointerHeld) return
    const releasePointer = () => {
      setPointerHeld(false)
    }
    window.addEventListener("pointerup", releasePointer, true)
    window.addEventListener("pointercancel", releasePointer, true)
    window.addEventListener("blur", releasePointer)
    return () => {
      window.removeEventListener("pointerup", releasePointer, true)
      window.removeEventListener("pointercancel", releasePointer, true)
      window.removeEventListener("blur", releasePointer)
    }
  }, [pointerHeld])

  return (
    <div
      className={`online-table-card ${
        zone === "battlefield" ? "battlefield-card-position" : ""
      } ${actionsOpen ? "online-table-card--menu-open" : ""}`}
      style={style}
      onContextMenu={event => {
        if (!canMove) return
        event.preventDefault()
        onOpenActions({ x: event.clientX, y: event.clientY })
      }}
    >
      <button
        ref={ref}
        className={`card ${compact ? "card--compact" : ""} ${
          card.tapped ? "card--tapped" : ""
        } ${isDragging ? "card--dragging online-card--dragging" : ""} ${
          pointerHeld ? "card--pointer-held" : ""
        }`}
        data-online-draggable={canMove ? "true" : undefined}
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
        onPointerDownCapture={event => {
          if (!canMove || event.button !== 0) return
          onCloseActions()
          beginCardPointerSession(
            event.currentTarget,
            { x: event.clientX, y: event.clientY },
            card.tapped,
          )
          setPointerHeld(true)
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
          aria-haspopup="menu"
          aria-expanded={actionsOpen}
          onClick={event => {
            if (actionsOpen) {
              onCloseActions()
              return
            }
            const bounds = event.currentTarget.getBoundingClientRect()
            onOpenActions({ x: bounds.right, y: bounds.bottom })
          }}
        >
          ⋮
        </button>
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
  perspective,
  activeMenu,
  onOpenCardMenu,
  onCloseMenus,
  commanderTax,
  onChangeCommanderTax,
  faceUpStack = false,
  onOpenZoneActions,
  onBrowseZone,
  onToggleTap,
}: {
  title: string
  zone: MoveZone
  cards: VisibleOnlineCard[]
  canMove: boolean
  compact?: boolean
  hiddenCount?: number
  playerId: string
  perspective: "self" | "opponent"
  activeMenu: OnlineActionMenu | null
  onOpenCardMenu: (
    card: VisibleOnlineCard,
    zone: MoveZone,
    point: MenuPoint,
  ) => void
  onCloseMenus: () => void
  commanderTax?: Record<string, number>
  onChangeCommanderTax?: (commanderId: string, delta: number) => void
  faceUpStack?: boolean
  onOpenZoneActions?: (
    point: MenuPoint,
    position: BattlefieldPosition,
  ) => void
  onBrowseZone?: () => void
  onToggleTap: (cardId: string) => void
}) => {
  const { ref, isDropTarget } = useDroppable({
    id: `online-${playerId}-${zone}`,
    type: "zone",
    data: { playerId, zone },
    accept: "card",
    disabled: !canMove,
  })
  const nextBattlefieldZ =
    Math.max(0, ...cards.map(card => card.position?.z ?? 0)) + 1
  const battlefieldPosition = (
    element: HTMLElement,
    point?: MenuPoint,
  ): BattlefieldPosition => {
    const surface =
      element.querySelector<HTMLElement>(".zone__cards") ?? element
    const bounds = surface.getBoundingClientRect()
    if (!point || bounds.width <= 0 || bounds.height <= 0) {
      return { x: 0.5, y: 0.5, z: nextBattlefieldZ }
    }
    return {
      x: Math.max(0, Math.min(1, (point.x - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (point.y - bounds.top) / bounds.height)),
      z: nextBattlefieldZ,
    }
  }

  return (
    <section
      ref={ref}
      className={`zone zone--${zone} ${
        zone === "command" ? "zone--commander-group" : ""
      } ${isDropTarget ? "zone--drop-target" : ""} ${
        faceUpStack ? "zone--face-up-stack" : ""
      }`}
      data-online-drop-zone={canMove ? zone : undefined}
      data-online-player-id={canMove ? playerId : undefined}
      aria-label={`${title}, ${hiddenCount ?? cards.length} kaarten`}
      onContextMenu={event => {
        if (
          (event.target as HTMLElement).closest(
            ".online-table-card, button, input, select",
          )
        ) {
          return
        }
        if (!canMove && !onBrowseZone) return
        event.preventDefault()
        if (canMove && onOpenZoneActions) {
          const point = { x: event.clientX, y: event.clientY }
          onOpenZoneActions(
            point,
            battlefieldPosition(event.currentTarget, point),
          )
        } else {
          onBrowseZone?.()
        }
      }}
    >
      <div className="zone__label">
        <span>{title}</span>
        <strong>{hiddenCount ?? cards.length}</strong>
        {(canMove && onOpenZoneActions) || onBrowseZone ? (
          <button
            type="button"
            className="zone__menu-trigger"
            aria-label={`${title}-acties openen`}
            onClick={event => {
              const bounds = event.currentTarget.getBoundingClientRect()
              if (canMove && onOpenZoneActions) {
                const zoneElement = event.currentTarget.closest<HTMLElement>(
                  ".zone",
                )
                onOpenZoneActions(
                  { x: bounds.right, y: bounds.bottom },
                  battlefieldPosition(zoneElement ?? event.currentTarget),
                )
              } else {
                onBrowseZone?.()
              }
            }}
          >
            ⋮
          </button>
        ) : null}
      </div>
      <div
        className={`zone__cards ${
          faceUpStack ? "zone__cards--face-up-stack" : ""
        }`}
      >
        {hiddenCount !== undefined ? (
          <HiddenHand count={hiddenCount} />
        ) : cards.length ? (
          (faceUpStack ? cards.slice(-1) : cards).map((card, index) => {
            const fallbackPosition =
              zone === "battlefield"
                ? {
                    x: Math.min(0.84, 0.12 + (index % 6) * 0.14),
                    y: 0.28 + Math.floor(index / 6) * 0.3,
                    z: index + 1,
                  }
                : undefined
            const storedPosition = card.position ?? fallbackPosition
            const position =
              zone === "battlefield" && storedPosition
                ? positionForViewer(storedPosition, perspective)
                : undefined
            const positionStyle = position
              ? {
                  left: `${position.x * 100}%`,
                  top: `${position.y * 100}%`,
                  zIndex: position.z,
                }
              : undefined
            const cardView = (
              <OnlineCard
                key={card.instanceId}
                card={card}
                zone={zone}
                canMove={canMove}
                compact={compact}
                style={positionStyle}
                actionsOpen={
                  activeMenu?.kind === "card" &&
                  activeMenu.instanceId === card.instanceId
                }
                onOpenActions={point => {
                  onOpenCardMenu(card, zone, point)
                }}
                onCloseActions={onCloseMenus}
                onToggleTap={() => {
                  onToggleTap(card.instanceId)
                }}
              />
            )
            if (faceUpStack) {
              return (
                <div
                  className="face-up-card-stack"
                  key={card.instanceId}
                  onDoubleClick={onBrowseZone}
                >
                  <span aria-hidden="true" />
                  <span aria-hidden="true" />
                  {cardView}
                </div>
              )
            }
            if (zone === "command" && card.isCommander) {
              const tax = commanderTax?.[card.instanceId] ?? 0
              return (
                <div className="command-card" key={card.instanceId}>
                  {cardView}
                  <div
                    className="commander-tax-control"
                    aria-label={`Commander tax van ${card.name}`}
                  >
                    <span>Tax</span>
                    <button
                      type="button"
                      disabled={!canMove || tax === 0}
                      onClick={() => {
                        onChangeCommanderTax?.(card.instanceId, -2)
                      }}
                    >
                      −
                    </button>
                    <strong>{tax}</strong>
                    <button
                      type="button"
                      disabled={!canMove}
                      onClick={() => {
                        onChangeCommanderTax?.(card.instanceId, 2)
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              )
            }
            return cardView
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
  actionsOpen,
  onOpenActions,
  onCloseActions,
}: {
  count: number
  playerId: string
  canMove: boolean
  actionsOpen: boolean
  onOpenActions: (point: MenuPoint) => void
  onCloseActions: () => void
}) => {
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
      onContextMenu={event => {
        if (!canMove) return
        event.preventDefault()
        onOpenActions({ x: event.clientX, y: event.clientY })
      }}
    >
      <div className="zone__label">
        <span>Library</span>
        <strong>{count}</strong>
        {canMove ? (
          <button
            type="button"
            className="zone__menu-trigger"
            aria-label="Library-acties openen"
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            onClick={event => {
              if (actionsOpen) {
                onCloseActions()
                return
              }
              const bounds = event.currentTarget.getBoundingClientRect()
              onOpenActions({ x: bounds.right, y: bounds.bottom })
            }}
          >
            ⋮
          </button>
        ) : null}
      </div>
      <div className="card-stack" aria-hidden="true">
        <span />
        <span />
        {count ? <img src="/magic-card-back.webp" alt="" /> : null}
      </div>
    </section>
  )
}

const OnlinePlayerControls = ({
  player,
  allPlayers,
  canControl,
  onCommand,
}: {
  player: PublicOnlinePlayer
  allPlayers: Record<string, PublicOnlinePlayer>
  canControl: boolean
  onCommand: (type: GameCommand["type"], payload: unknown) => void
}) => {
  const opposingCommanders = Object.values(allPlayers)
    .filter(candidate => candidate.id !== player.id)
    .flatMap(candidate => [
      ...candidate.command,
      ...candidate.battlefield,
      ...candidate.graveyard,
      ...candidate.exile,
    ])
    .filter(card => card.isCommander)
    .filter(
      (card, index, cards) =>
        cards.findIndex(
          candidate => candidate.instanceId === card.instanceId,
        ) === index,
    )

  return (
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
        <strong>
          {player.poison} <small>/ 10</small>
        </strong>
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
      {optionalTrackers
        .filter(tracker => player.visibleTrackers[tracker])
        .map(tracker => (
          <div className="status-counter" key={tracker}>
            <span>{trackerLabels[tracker]}</span>
            <button
              type="button"
              disabled={!canControl || player.trackers[tracker] === 0}
              onClick={() => {
                onCommand("CHANGE_TRACKER", { tracker, delta: -1 })
              }}
            >
              −
            </button>
            <strong>{player.trackers[tracker]}</strong>
            <button
              type="button"
              disabled={!canControl}
              onClick={() => {
                onCommand("CHANGE_TRACKER", { tracker, delta: 1 })
              }}
            >
              +
            </button>
          </div>
        ))}
      <details className="tracker-settings">
        <summary>Optionele trackers</summary>
        <div>
          {optionalTrackers.map(tracker => (
            <label key={tracker}>
              <input
                type="checkbox"
                disabled={!canControl}
                checked={player.visibleTrackers[tracker]}
                onChange={event => {
                  onCommand("SET_TRACKER_VISIBILITY", {
                    tracker,
                    visible: event.target.checked,
                  })
                }}
              />
              {trackerLabels[tracker]}
            </label>
          ))}
        </div>
      </details>
      {opposingCommanders.length ? (
        <details className="commander-tracker">
          <summary>Commander damage</summary>
          {opposingCommanders.map(commander => {
            const damage = player.commanderDamage[commander.instanceId] ?? 0
            return (
              <div className="status-counter" key={commander.instanceId}>
                <span title={commander.name}>{commander.name}</span>
                <button
                  type="button"
                  disabled={!canControl || damage === 0}
                  onClick={() => {
                    onCommand("CHANGE_COMMANDER_DAMAGE", {
                      commanderId: commander.instanceId,
                      delta: -1,
                    })
                  }}
                >
                  −
                </button>
                <strong>
                  {damage} <small>/ 21</small>
                </strong>
                <button
                  type="button"
                  disabled={!canControl}
                  onClick={() => {
                    onCommand("CHANGE_COMMANDER_DAMAGE", {
                      commanderId: commander.instanceId,
                      delta: 1,
                    })
                  }}
                >
                  +
                </button>
              </div>
            )
          })}
        </details>
      ) : null}
      <div className="player-status-toggles">
        <button
          type="button"
          disabled={!canControl}
          className={player.citysBlessing ? "is-active" : ""}
          aria-pressed={player.citysBlessing}
          onClick={() => {
            onCommand("SET_CITYS_BLESSING", {
              active: !player.citysBlessing,
            })
          }}
        >
          City&apos;s Blessing
        </button>
        <button
          type="button"
          disabled={!canControl}
          className={player.disabled ? "is-disabled" : ""}
          aria-pressed={player.disabled}
          onClick={() => {
            onCommand("SET_PLAYER_DISABLED", {
              disabled: !player.disabled,
            })
          }}
        >
          {player.disabled ? "Uitgeschakeld" : "Speler uitschakelen"}
        </button>
      </div>
      <small className="online-player-counts">
        Hand {player.handCount} · Library {player.libraryCount}
      </small>
    </div>
  )
}

const OnlinePlayerBoard = ({
  player,
  allPlayers,
  orientation,
  isActive,
  isSelf,
  ownHand,
  canPlay,
  activeMenu,
  onOpenCardMenu,
  onOpenLibraryMenu,
  onOpenBattlefieldMenu,
  onBrowseZone,
  onCloseMenus,
  onCommand,
}: {
  player: PublicOnlinePlayer
  allPlayers: Record<string, PublicOnlinePlayer>
  orientation: "opponent" | "self"
  isActive: boolean
  isSelf: boolean
  ownHand: VisibleOnlineCard[] | null
  canPlay: boolean
  activeMenu: OnlineActionMenu | null
  onOpenCardMenu: (
    card: VisibleOnlineCard,
    zone: MoveZone,
    point: MenuPoint,
  ) => void
  onOpenLibraryMenu: (count: number, point: MenuPoint) => void
  onOpenBattlefieldMenu: (
    point: MenuPoint,
    position: BattlefieldPosition,
  ) => void
  onBrowseZone: (zone: "graveyard" | "exile") => void
  onCloseMenus: () => void
  onCommand: (type: GameCommand["type"], payload: unknown) => void
}) => {
  const toggleTap = (instanceId: string) => {
    onCommand("TOGGLE_TAP", { instanceId })
  }
  const canControl = isSelf && canPlay

  return (
    <section
      className={`player-board player-board--${orientation} ${
        isActive ? "player-board--active" : ""
      } ${player.disabled ? "player-board--disabled" : ""}`}
      aria-label={`Speelveld van ${player.displayName}`}
    >
      <aside className="player-rail">
        <div>
          <span className="eyebrow">
            {isSelf ? "Jouw speelveld" : "Tegenstander"}
          </span>
          <h2>{player.displayName}</h2>
        </div>
        <OnlinePlayerControls
          player={player}
          allPlayers={allPlayers}
          canControl={canControl}
          onCommand={onCommand}
        />
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
            perspective={orientation}
            activeMenu={activeMenu}
            onOpenCardMenu={onOpenCardMenu}
            onCloseMenus={onCloseMenus}
            commanderTax={player.commanderTax}
            onChangeCommanderTax={(commanderId, delta) => {
              onCommand("CHANGE_COMMANDER_TAX", { commanderId, delta })
            }}
            onToggleTap={toggleTap}
          />
        </div>
        <OnlineZone
          title="Battlefield"
          zone="battlefield"
          playerId={player.id}
          cards={player.battlefield}
          canMove={canControl}
          perspective={orientation}
          activeMenu={activeMenu}
          onOpenCardMenu={onOpenCardMenu}
          onCloseMenus={onCloseMenus}
          onOpenZoneActions={onOpenBattlefieldMenu}
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
          perspective={orientation}
          activeMenu={activeMenu}
          onOpenCardMenu={onOpenCardMenu}
          onCloseMenus={onCloseMenus}
          onToggleTap={toggleTap}
        />
      </div>

      <aside className="pile-rail">
        <LibraryStack
          count={player.libraryCount}
          playerId={player.id}
          canMove={canControl}
          actionsOpen={activeMenu?.kind === "library"}
          onOpenActions={point => {
            onOpenLibraryMenu(player.libraryCount, point)
          }}
          onCloseActions={onCloseMenus}
        />
        <OnlineZone
          title="Graveyard"
          zone="graveyard"
          playerId={player.id}
          cards={player.graveyard}
          canMove={canControl}
          compact
          perspective={orientation}
          activeMenu={activeMenu}
          onOpenCardMenu={onOpenCardMenu}
          onCloseMenus={onCloseMenus}
          faceUpStack
          onBrowseZone={() => {
            onBrowseZone("graveyard")
          }}
          onToggleTap={toggleTap}
        />
        <OnlineZone
          title="Exile"
          zone="exile"
          playerId={player.id}
          cards={player.exile}
          canMove={canControl}
          compact
          perspective={orientation}
          activeMenu={activeMenu}
          onOpenCardMenu={onOpenCardMenu}
          onCloseMenus={onCloseMenus}
          faceUpStack
          onBrowseZone={() => {
            onBrowseZone("exile")
          }}
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
              actionsOpen={false}
              onOpenActions={() => undefined}
              onCloseActions={() => undefined}
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
  const dragAnchor = useRef<DragAnchor | null>(null)
  const [activeActionMenu, setActiveActionMenu] =
    useState<OnlineActionMenu | null>(null)
  const [zoneBrowser, setZoneBrowser] = useState<{
    playerId: string
    zone: "graveyard" | "exile"
  } | null>(null)
  const [libraryBrowser, setLibraryBrowser] = useState<{
    search: boolean
  } | null>(null)
  const [localTokenDefinitions, setLocalTokenDefinitions] = useState<
    OnlineTokenDefinition[]
  >([])
  const [hideLibraryPending, setHideLibraryPending] = useState(false)
  const [confirmAbort, setConfirmAbort] = useState(false)
  const [aborting, setAborting] = useState(false)
  const [abortError, setAbortError] = useState<string | null>(null)

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
            if (update.event.type === "GAME_ABORTED") {
              connection.close()
              navigate("/online", true)
              return
            }
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

  const sendCommand = useCallback(
    (type: GameCommand["type"], payload: unknown) => {
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
    },
    [dispatch, online.view],
  )

  useEffect(() => {
    if (!hideLibraryPending || online.pendingCommandIds.length > 0) return
    if (!online.view?.privateView?.revealedLibraryCards.length) {
      setHideLibraryPending(false)
      return
    }
    setHideLibraryPending(false)
    sendCommand("HIDE_LIBRARY", {})
  }, [
    hideLibraryPending,
    online.pendingCommandIds.length,
    online.view?.privateView?.revealedLibraryCards.length,
    sendCommand,
  ])

  const abortGame = async () => {
    setAborting(true)
    setAbortError(null)
    try {
      await onlineGames.abortGame(gameId)
      connectionRef.current?.close()
      navigate("/online", true)
    } catch (error) {
      setAbortError(
        error instanceof Error
          ? error.message
          : "De game kon niet worden afgebroken.",
      )
      setAborting(false)
    }
  }

  const view = online.view
  const privateDeckSnapshotId = view?.privateView?.deckSnapshotId
  const serverTokenDefinitions = view?.privateView?.availableTokens ?? []
  useEffect(() => {
    let active = true
    if (!privateDeckSnapshotId || serverTokenDefinitions.length > 0) {
      setLocalTokenDefinitions([])
      return () => {
        active = false
      }
    }
    void repositories.decks.get(privateDeckSnapshotId).then(deck => {
      if (!active || !deck) return
      const tokens = deck.definitions
        .filter(definition => definition.token?.source === "deck")
        .map(definition => {
          const face = definition.faces[0]
          return {
            definitionId: definition.id,
            name: face?.name ?? definition.name,
            typeLine: face?.typeLine ?? definition.typeLine,
            imageUrl: face?.imageUrl ?? definition.imageRefs[0]?.url,
            scryfallId: definition.scryfallId,
            kind: definition.token?.kind ?? "other",
            power: definition.token?.power,
            toughness: definition.token?.toughness,
          } satisfies OnlineTokenDefinition
        })
        .sort((first, second) => first.name.localeCompare(second.name))
      setLocalTokenDefinitions(tokens)
    })
    return () => {
      active = false
    }
  }, [privateDeckSnapshotId, serverTokenDefinitions.length])
  const tokenDefinitions = serverTokenDefinitions.length
    ? serverTokenDefinitions
    : localTokenDefinitions
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

  const handleDragStart = (event: DragStartEvent) => {
    setActiveActionMenu(null)
    const pointer = pointerFromEvent(event.operation.activatorEvent)
    const sourceElement = event.operation.source?.element
    if (!pointer || !sourceElement) {
      dragAnchor.current = null
      return
    }
    const sourceBounds = sourceElement.getBoundingClientRect()
    if (sourceElement.classList.contains("card--tapped")) {
      const grabX = Number(sourceElement.getAttribute("data-drag-grab-x"))
      const grabY = Number(sourceElement.getAttribute("data-drag-grab-y"))
      if (Number.isFinite(grabX) && Number.isFinite(grabY)) {
        const relativePoint = { x: grabX, y: grabY }
        dragAnchor.current = dragAnchorFromRelativePoint(
          sourceBounds,
          relativePoint,
        )
        window.requestAnimationFrame(() => {
          if (!sourceElement.hasAttribute("data-dnd-dragging")) return
          const currentPointer = event.operation.position.current
          const correction = correctionForRelativePoint(
            sourceElement.getBoundingClientRect(),
            currentPointer,
            relativePoint,
          )
          const card = sourceElement as HTMLElement
          card.style.setProperty("--card-drag-follow-x", `${correction.x}px`)
          card.style.setProperty("--card-drag-follow-y", `${correction.y}px`)
        })
        return
      }
    }
    dragAnchor.current = dragAnchorFromPointer(
      sourceBounds,
      pointer,
      transformScale(sourceElement),
    )
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const activeDragAnchor = dragAnchor.current
    dragAnchor.current = null
    if (event.canceled || !view || !ownPlayerId || !canPlay) return
    const sourceData = event.operation.source?.data
    const targetData = event.operation.target?.data
    // De sensorpositie is de authoritative releasepositie. Het native
    // dragend-event kan in Chromium 0,0 of de activatiepositie bevatten.
    const pointer = event.operation.position.current
    const fallbackTarget = pointer ? findOnlineDropTarget(pointer) : null
    const targetPlayerId =
      fallbackTarget?.playerId ??
      (typeof targetData?.playerId === "string"
        ? targetData.playerId
        : undefined)
    const targetZoneValue =
      fallbackTarget?.zone ??
      (typeof targetData?.zone === "string" ? targetData.zone : undefined)
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
            fallbackTarget?.element ?? event.operation.target?.element
          )?.querySelector<HTMLElement>(".zone__cards")
        : null
    const cardBounds = event.operation.shape?.current.boundingRectangle
    const placementBounds =
      pointer && activeDragAnchor
        ? cardBoundsAtPointer(pointer, activeDragAnchor)
        : cardBounds
    const nextZ =
      Math.max(
        0,
        ...(ownPlayer?.battlefield.map(card => card.position?.z ?? 0) ?? []),
      ) + 1
    const position =
      targetZone === "battlefield" && battlefieldSurface && placementBounds
        ? positionFromDrop(
            placementBounds,
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
          {view?.isHost ? (
            <button
              className="lobby-delete-button"
              type="button"
              onClick={() => {
                setAbortError(null)
                setConfirmAbort(true)
              }}
            >
              Spel afbreken
            </button>
          ) : null}
        </nav>
      </header>

      {online.lastError ? (
        <p className="online-message online-game-error" role="alert">
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
        <DragDropProvider
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
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
                    allPlayers={view.players}
                    orientation={isSelf ? "self" : "opponent"}
                    isActive={view.activePlayerId === playerId}
                    isSelf={isSelf}
                    ownHand={isSelf ? (view.privateView?.hand ?? []) : null}
                    canPlay={canPlay}
                    activeMenu={activeActionMenu}
                    onOpenCardMenu={(card, zone, point) => {
                      setActiveActionMenu({
                        kind: "card",
                        instanceId: card.instanceId,
                        name: card.name,
                        zone,
                        tapped: card.tapped,
                        point,
                      })
                    }}
                    onOpenLibraryMenu={(count, point) => {
                      setActiveActionMenu({
                        kind: "library",
                        count,
                        point,
                      })
                    }}
                    onOpenBattlefieldMenu={(point, position) => {
                      setActiveActionMenu({
                        kind: "battlefield",
                        point,
                        position,
                      })
                    }}
                    onBrowseZone={zone => {
                      setActiveActionMenu(null)
                      setZoneBrowser({ playerId, zone })
                    }}
                    onCloseMenus={() => {
                      setActiveActionMenu(null)
                    }}
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
          <OnlineActionMenuPortal
            menu={activeActionMenu}
            tokenDefinitions={tokenDefinitions}
            onClose={() => {
              setActiveActionMenu(null)
            }}
            onMove={(instanceId, zone) => {
              sendCommand("MOVE_CARD", { instanceId, zone })
            }}
            onToggleTap={instanceId => {
              sendCommand("TOGGLE_TAP", { instanceId })
            }}
            onZoneCommand={(type, amount) => {
              sendCommand(
                type,
                type === "DRAW_CARD" || type === "MILL"
                  ? { amount: amount ?? 1 }
                  : {},
              )
            }}
            onCreateToken={(token, position) => {
              sendCommand("CREATE_TOKEN", { token, position })
            }}
            onBrowseLibrary={({ search = false, amount }) => {
              setLibraryBrowser({ search })
              sendCommand("REVEAL_LIBRARY", { amount })
            }}
          />
          {zoneBrowser && view.players[zoneBrowser.playerId] ? (
            <OnlinePublicZoneBrowser
              title={zoneBrowser.zone === "graveyard" ? "Graveyard" : "Exile"}
              playerName={
                view.players[zoneBrowser.playerId]?.displayName ?? "Speler"
              }
              cards={
                view.players[zoneBrowser.playerId]?.[zoneBrowser.zone] ?? []
              }
              canMove={zoneBrowser.playerId === ownPlayerId && canPlay}
              onMove={(instanceId, zone) => {
                sendCommand("MOVE_CARD", { instanceId, zone })
              }}
              onClose={() => {
                setZoneBrowser(null)
              }}
            />
          ) : null}
          {libraryBrowser && view.privateView?.revealedLibraryCards.length ? (
            <OnlinePublicZoneBrowser
              title="Library"
              playerName={
                ownPlayerId
                  ? (view.players[ownPlayerId]?.displayName ?? "Jij")
                  : "Jij"
              }
              cards={view.privateView.revealedLibraryCards}
              canMove={canPlay}
              initialSearch={libraryBrowser.search}
              onMove={(instanceId, zone) => {
                sendCommand("MOVE_CARD", { instanceId, zone })
              }}
              onClose={() => {
                setLibraryBrowser(null)
                setHideLibraryPending(true)
              }}
            />
          ) : null}
        </DragDropProvider>
      )}
      {confirmAbort ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="abort-game-title"
          >
            <span className="eyebrow">Online game beëindigen</span>
            <h2 id="abort-game-title">Spel voor iedereen afbreken?</h2>
            <p>
              Alle spelers verlaten deze battle. Dit kan niet ongedaan worden
              gemaakt.
            </p>
            {abortError ? <p role="alert">{abortError}</p> : null}
            <div>
              <button
                className="button button--secondary"
                type="button"
                disabled={aborting}
                onClick={() => {
                  setConfirmAbort(false)
                }}
              >
                Annuleren
              </button>
              <button
                className="lobby-delete-button"
                type="button"
                disabled={aborting}
                onClick={() => void abortGame()}
              >
                {aborting ? "Afbreken…" : "Ja, spel afbreken"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}
