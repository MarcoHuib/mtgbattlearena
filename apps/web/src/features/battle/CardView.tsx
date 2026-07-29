import { Feedback } from "@dnd-kit/dom"
import { useDraggable } from "@dnd-kit/react"
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { useAppDispatch, useAppSelector } from "../../app/hooks"
import type { CardDefinition, CardInstance, Zone } from "@mtg/game-core/types"
import { useOnlineStatus } from "../../hooks/useOnlineStatus"
import { resolveCardImage } from "../../persistence/imageResolver"
import {
  attach,
  changeStackOrder,
  copyToken,
  detach,
  moveGameCard,
  moveGameCards,
  setCounter,
  switchFace,
  toggleTap,
} from "../game/gameSlice"
import { clearCardSelection, toggleCardSelection } from "../ui/uiSlice"
import {
  dragCorrectionAfterScale,
  relativePointInRectangle,
} from "./battlefieldPosition"

type CardViewProps = {
  instance: CardInstance
  definition: CardDefinition
  compact?: boolean
  displayOnly?: boolean
  disableDrag?: boolean
}

const zoneLabels: Record<Zone, string> = {
  library: "Library",
  hand: "Hand",
  battlefield: "Battlefield",
  graveyard: "Graveyard",
  exile: "Exile",
  command: "Command zone",
}

type MenuPoint = {
  x: number
  y: number
}

const POINTER_ACTIVE_CLASS = "card-pointer-active"
const DRAG_OFFSET_X = "--card-drag-offset-x"
const DRAG_OFFSET_Y = "--card-drag-offset-y"
const DRAG_FOLLOW_X = "--card-drag-follow-x"
const DRAG_FOLLOW_Y = "--card-drag-follow-y"
let pointerSessionSequence = 0
let activePointerSession: number | null = null
let clearHoverSuppression: (() => void) | null = null

const CARD_DRAG_PLUGINS = [
  Feedback.configure({
    // De state wordt bij drop direct op de nieuwe zone/positie gerenderd.
    // Een tweede animatie naar de oude placeholder veroorzaakt dan een
    // zichtbare terugslag.
    dropAnimation: null,
  }),
]

const transformScale = (element: Element) => {
  const transform = getComputedStyle(element).transform
  if (transform === "none") return { x: 1, y: 1 }
  const matrix = new DOMMatrixReadOnly(transform)
  return {
    x: Math.hypot(matrix.a, matrix.b) || 1,
    y: Math.hypot(matrix.c, matrix.d) || 1,
  }
}

const beginPointerSession = (
  card: HTMLElement,
  pointer: { x: number; y: number },
  tapped: boolean,
) => {
  clearHoverSuppression?.()
  pointerSessionSequence += 1
  const session = pointerSessionSequence
  activePointerSession = session
  card.style.removeProperty(DRAG_OFFSET_X)
  card.style.removeProperty(DRAG_OFFSET_Y)
  card.style.removeProperty(DRAG_FOLLOW_X)
  card.style.removeProperty(DRAG_FOLLOW_Y)
  if (tapped) {
    const bounds = card.getBoundingClientRect()
    const relativePoint = relativePointInRectangle(bounds, pointer)
    const correction = dragCorrectionAfterScale(
      bounds,
      pointer,
      transformScale(card),
    )
    card.dataset.dragGrabX = String(relativePoint.x)
    card.dataset.dragGrabY = String(relativePoint.y)
    card.style.setProperty(DRAG_OFFSET_X, `${correction.x}px`)
    card.style.setProperty(DRAG_OFFSET_Y, `${correction.y}px`)
  }
  document.documentElement.classList.add(POINTER_ACTIVE_CLASS)
  let released = false
  const releasePointerSession = () => {
    if (released) return
    released = true
    window.removeEventListener("pointerup", releasePointerSession, true)
    window.removeEventListener("pointercancel", releasePointerSession, true)
    window.removeEventListener("blur", releasePointerSession)
    finishPointerSession(session, card)
  }
  window.addEventListener("pointerup", releasePointerSession, true)
  window.addEventListener("pointercancel", releasePointerSession, true)
  window.addEventListener("blur", releasePointerSession)
}

const finishPointerSession = (session: number, card: HTMLElement) => {
  card.style.removeProperty(DRAG_OFFSET_X)
  card.style.removeProperty(DRAG_OFFSET_Y)
  card.style.removeProperty(DRAG_FOLLOW_X)
  card.style.removeProperty(DRAG_FOLLOW_Y)
  delete card.dataset.dragGrabX
  delete card.dataset.dragGrabY
  if (activePointerSession !== session) return

  const releaseHoverSuppression = () => {
    window.removeEventListener("pointermove", releaseHoverSuppression, true)
    window.removeEventListener("pointerdown", releaseHoverSuppression, true)
    window.removeEventListener("blur", releaseHoverSuppression)
    if (activePointerSession === session) {
      activePointerSession = null
      document.documentElement.classList.remove(POINTER_ACTIVE_CLASS)
    }
    if (clearHoverSuppression === releaseHoverSuppression) {
      clearHoverSuppression = null
    }
  }

  // Laat de kaart na het neerleggen op normale grootte staan. Hoverzoom wordt
  // pas opnieuw actief zodra de gebruiker de pointer bewust beweegt.
  clearHoverSuppression = releaseHoverSuppression
  window.addEventListener("pointermove", releaseHoverSuppression, true)
  window.addEventListener("pointerdown", releaseHoverSuppression, true)
  window.addEventListener("blur", releaseHoverSuppression)
}

const counterTypes = [
  { key: "+1/+1", label: "+1/+1" },
  { key: "-1/-1", label: "-1/-1" },
  { key: "loyalty", label: "Loyalty" },
  { key: "charge", label: "Charge" },
] as const

const getMenuStyle = ({ x, y }: MenuPoint): CSSProperties => {
  const width = Math.min(310, window.innerWidth - 24)
  const height = 620
  const top = Math.max(
    12,
    Math.min(y - 28, window.innerHeight - Math.min(height, window.innerHeight)),
  )
  const left =
    x + width + 16 <= window.innerWidth ? x + 8 : Math.max(12, x - width - 8)

  return { top, left, width }
}

export const CardView = ({
  instance,
  definition,
  compact = false,
  displayOnly = false,
  disableDrag = false,
}: CardViewProps) => {
  const dispatch = useAppDispatch()
  const online = useOnlineStatus()
  const activeFace =
    definition.faces[instance.activeFaceIndex] ?? definition.faces[0]
  const imageRef = definition.imageRefs.find(
    image => image.faceIndex === instance.activeFaceIndex,
  )
  const imageAssetKey = imageRef?.assetKey
  const remoteImageUrl = imageRef?.url
  const [imageUrl, setImageUrl] = useState<string | null>(
    online ? (remoteImageUrl ?? null) : null,
  )
  const [imageFailed, setImageFailed] = useState(false)
  const [menuPoint, setMenuPoint] = useState<MenuPoint | null>(null)
  const [pointerHeld, setPointerHeld] = useState(false)
  const [customCounter, setCustomCounter] = useState("")
  const [attachmentTarget, setAttachmentTarget] = useState("")
  const touchHoldTimer = useRef<number | null>(null)
  const touchStart = useRef<MenuPoint | null>(null)
  const lastPointerWasTouch = useRef(false)
  const { ref, isDragging } = useDraggable({
    id: displayOnly
      ? `display-only-${instance.instanceId}`
      : instance.instanceId,
    type: "card",
    data: { instanceId: instance.instanceId },
    disabled: displayOnly || disableDrag,
    plugins: CARD_DRAG_PLUGINS,
  })
  const cardName = activeFace?.name ?? definition.name
  const cardLabel = `${cardName}, ${zoneLabels[instance.zone]}${
    instance.tapped ? ", getapt" : ""
  }`
  const selectedCardIds = useAppSelector(state => state.ui.selectedCardIds)
  const game = useAppSelector(state => state.game.present)
  const gameCards = game?.cardsById
  const selected = selectedCardIds.includes(instance.instanceId)
  const destinationPlayer = instance.controllerId
  const attachedTarget = instance.attachedTo
    ? gameCards?.[instance.attachedTo]
    : undefined
  const attachedTargetName = attachedTarget
    ? game?.cardDefinitionsById[attachedTarget.definitionId]?.name
    : undefined
  const attachedCards = Object.values(gameCards ?? {}).filter(
    card => card.attachedTo === instance.instanceId,
  )

  useEffect(() => {
    let active = true
    let revoke: (() => void) | undefined
    setImageUrl(online ? (remoteImageUrl ?? null) : null)
    setImageFailed(false)
    void resolveCardImage(imageRef, online).then(resolved => {
      if (!active) {
        resolved?.revoke?.()
        return
      }
      revoke = resolved?.revoke
      setImageFailed(false)
      setImageUrl(resolved?.url ?? null)
    })
    return () => {
      active = false
      revoke?.()
    }
  }, [imageAssetKey, imageRef, online, remoteImageUrl])

  useEffect(() => {
    if (!menuPoint) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuPoint(null)
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [menuPoint])

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

  useEffect(
    () => () => {
      if (touchHoldTimer.current !== null) {
        window.clearTimeout(touchHoldTimer.current)
      }
    },
    [],
  )

  const options = useMemo(
    () =>
      (
        [
          "library",
          "hand",
          "battlefield",
          "graveyard",
          "exile",
          "command",
        ] as Zone[]
      ).filter(zone => zone !== instance.zone),
    [instance.zone],
  )

  const performAction = (value: string) => {
    if (value) {
      const selectedInstances = selectedCardIds.filter(
        instanceId =>
          gameCards?.[instanceId]?.controllerId === destinationPlayer,
      )
      if (selected && selectedInstances.length > 1) {
        dispatch(
          moveGameCards({
            moves: selectedInstances.map(instanceId => ({
              instanceId,
              playerId: destinationPlayer,
              zone: value as Zone,
            })),
          }),
        )
        dispatch(clearCardSelection())
      } else {
        dispatch(
          moveGameCard({
            instanceId: instance.instanceId,
            playerId: destinationPlayer,
            zone: value as Zone,
          }),
        )
      }
    }
    setMenuPoint(null)
  }

  const changeCounter = (counter: string, delta: number) => {
    dispatch(
      setCounter({
        instanceId: instance.instanceId,
        counter,
        value: (instance.counters[counter] ?? 0) + delta,
      }),
    )
  }

  const counters = Object.entries(instance.counters).filter(
    ([, value]) => value > 0,
  )
  const cancelTouchHold = () => {
    if (touchHoldTimer.current !== null) {
      window.clearTimeout(touchHoldTimer.current)
      touchHoldTimer.current = null
    }
    touchStart.current = null
  }
  const actionMenu =
    menuPoint && !isDragging
      ? createPortal(
          <div
            className="card-action-layer"
            onPointerDown={() => {
              setMenuPoint(null)
            }}
          >
            <section
              className="card-action-menu"
              style={getMenuStyle(menuPoint)}
              role="dialog"
              aria-modal="true"
              aria-label={`Kaartacties voor ${definition.name}`}
              onPointerDown={event => {
                event.stopPropagation()
              }}
            >
              <header>
                <div>
                  <span className="eyebrow">Kaartacties</span>
                  <strong>{definition.name}</strong>
                </div>
                <button
                  type="button"
                  aria-label="Kaartacties sluiten"
                  onClick={() => {
                    setMenuPoint(null)
                  }}
                >
                  ×
                </button>
              </header>
              {selected && selectedCardIds.length > 1 ? (
                <p className="card-action-menu__selection">
                  Actie geldt voor {selectedCardIds.length} geselecteerde
                  kaarten wanneer mogelijk.
                </p>
              ) : null}
              {instance.zone === "battlefield" ? (
                <button
                  className="card-action-menu__primary"
                  type="button"
                  onClick={() => {
                    dispatch(toggleTap({ instanceId: instance.instanceId }))
                    setMenuPoint(null)
                  }}
                >
                  <span>↻</span>
                  {instance.tapped ? "Untappen" : "Tappen"}
                </button>
              ) : null}
              {definition.faces.length > 1 ? (
                <button
                  className="card-action-menu__primary"
                  type="button"
                  onClick={() => {
                    dispatch(switchFace({ instanceId: instance.instanceId }))
                  }}
                >
                  <span>◫</span>
                  Toon volgende kaartzijde
                </button>
              ) : null}
              {instance.zone === "battlefield" ? (
                <div className="card-action-menu__row">
                  <button
                    type="button"
                    onClick={() => {
                      dispatch(
                        changeStackOrder({
                          instanceId: instance.instanceId,
                          direction: "front",
                        }),
                      )
                    }}
                  >
                    Naar voren
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      dispatch(
                        changeStackOrder({
                          instanceId: instance.instanceId,
                          direction: "back",
                        }),
                      )
                    }}
                  >
                    Naar achteren
                  </button>
                </div>
              ) : null}
              {instance.zone === "battlefield" ? (
                <div className="card-action-menu__attachment">
                  <label>
                    <span>Attachment koppelen</span>
                    <select
                      value={attachmentTarget}
                      onChange={event => {
                        setAttachmentTarget(event.target.value)
                      }}
                    >
                      <option value="">Kies een permanent…</option>
                      {(
                        game?.players[instance.controllerId].zones
                          .battlefield ?? []
                      )
                        .filter(
                          instanceId => instanceId !== instance.instanceId,
                        )
                        .map(instanceId => {
                          const card = gameCards?.[instanceId]
                          const targetDefinition = card
                            ? game?.cardDefinitionsById[card.definitionId]
                            : undefined
                          return (
                            <option key={instanceId} value={instanceId}>
                              {targetDefinition?.name ?? instanceId}
                            </option>
                          )
                        })}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!attachmentTarget}
                    onClick={() => {
                      dispatch(
                        attach({
                          attachmentId: instance.instanceId,
                          targetId: attachmentTarget,
                        }),
                      )
                      setAttachmentTarget("")
                    }}
                  >
                    Koppelen
                  </button>
                  {instance.attachedTo ? (
                    <button
                      type="button"
                      onClick={() =>
                        dispatch(detach({ attachmentId: instance.instanceId }))
                      }
                    >
                      Losmaken van {attachedTargetName ?? "permanent"}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {definition.token ? (
                <button
                  className="card-action-menu__primary"
                  type="button"
                  onClick={() => {
                    dispatch(
                      copyToken({
                        instanceId: instance.instanceId,
                        duplicateId: `token-${crypto.randomUUID()}`,
                      }),
                    )
                  }}
                >
                  <span>⧉</span>
                  Token dupliceren
                </button>
              ) : null}
              <label className="card-action-menu__move">
                <span>Verplaats kaart</span>
                <select
                  aria-label={`Verplaats ${definition.name}`}
                  defaultValue=""
                  onChange={event => {
                    performAction(event.target.value)
                  }}
                >
                  <option value="" disabled>
                    Kies een zone…
                  </option>
                  {options.map(zone => (
                    <option key={zone} value={zone}>
                      Naar {zoneLabels[zone].toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
              {instance.zone === "battlefield" ? (
                <div
                  className="counter-controls"
                  aria-label={`Counters op ${definition.name}`}
                >
                  <span className="counter-controls__title">Counters</span>
                  {counterTypes.map(counter => {
                    const value = instance.counters[counter.key] ?? 0
                    return (
                      <div className="counter-control" key={counter.key}>
                        <span>{counter.label}</span>
                        <button
                          type="button"
                          aria-label={`Verwijder ${counter.label}-counter van ${definition.name}`}
                          disabled={value === 0}
                          onClick={() => {
                            changeCounter(counter.key, -1)
                          }}
                        >
                          −
                        </button>
                        <strong>{value}</strong>
                        <button
                          type="button"
                          aria-label={`Voeg ${counter.label}-counter toe aan ${definition.name}`}
                          onClick={() => {
                            changeCounter(counter.key, 1)
                          }}
                        >
                          +
                        </button>
                      </div>
                    )
                  })}
                  {counters
                    .filter(
                      ([counter]) =>
                        !counterTypes.some(type => type.key === counter),
                    )
                    .map(([counter, value]) => (
                      <div className="counter-control" key={counter}>
                        <span>{counter}</span>
                        <button
                          type="button"
                          aria-label={`Verwijder ${counter}-counter van ${definition.name}`}
                          onClick={() => {
                            changeCounter(counter, -1)
                          }}
                        >
                          −
                        </button>
                        <strong>{value}</strong>
                        <button
                          type="button"
                          aria-label={`Voeg ${counter}-counter toe aan ${definition.name}`}
                          onClick={() => {
                            changeCounter(counter, 1)
                          }}
                        >
                          +
                        </button>
                      </div>
                    ))}
                  <form
                    className="custom-counter"
                    onSubmit={event => {
                      event.preventDefault()
                      if (!customCounter.trim()) return
                      changeCounter(customCounter, 1)
                      setCustomCounter("")
                    }}
                  >
                    <label>
                      <span>Benoemde counter</span>
                      <input
                        value={customCounter}
                        placeholder="bijv. shield"
                        onChange={event => {
                          setCustomCounter(event.target.value)
                        }}
                      />
                    </label>
                    <button type="submit">Toevoegen</button>
                  </form>
                </div>
              ) : null}
            </section>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <article
        ref={ref}
        className={`card ${compact ? "card--compact" : ""} ${
          instance.tapped ? "card--tapped" : ""
        } ${isDragging ? "card--dragging" : ""} ${
          pointerHeld ? "card--pointer-held" : ""
        } ${selected ? "card--selected" : ""}`}
        aria-label={cardLabel}
        aria-expanded={displayOnly ? undefined : menuPoint !== null}
        aria-haspopup={displayOnly ? undefined : "dialog"}
        aria-keyshortcuts={displayOnly ? undefined : "Shift+F10"}
        aria-pressed={displayOnly ? undefined : selected}
        data-card-name={definition.name}
        tabIndex={0}
        onPointerDownCapture={event => {
          if (!displayOnly && !disableDrag && event.button === 0) {
            lastPointerWasTouch.current = event.pointerType === "touch"
            beginPointerSession(
              event.currentTarget,
              { x: event.clientX, y: event.clientY },
              instance.tapped,
            )
            setPointerHeld(true)
            if (event.pointerType === "touch") {
              touchStart.current = { x: event.clientX, y: event.clientY }
              touchHoldTimer.current = window.setTimeout(() => {
                setMenuPoint({ x: event.clientX, y: event.clientY })
                touchHoldTimer.current = null
              }, 650)
            }
          }
        }}
        onPointerMoveCapture={event => {
          const start = touchStart.current
          if (
            start &&
            Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8
          ) {
            cancelTouchHold()
          }
        }}
        onPointerUpCapture={cancelTouchHold}
        onPointerCancel={cancelTouchHold}
        onClick={event => {
          if (
            !displayOnly &&
            (lastPointerWasTouch.current ||
              event.ctrlKey ||
              event.metaKey ||
              event.shiftKey)
          ) {
            event.preventDefault()
            dispatch(toggleCardSelection(instance.instanceId))
          }
          lastPointerWasTouch.current = false
        }}
        onDoubleClick={() => {
          if (!displayOnly && instance.zone === "battlefield") {
            dispatch(toggleTap({ instanceId: instance.instanceId }))
          }
        }}
        onContextMenu={event => {
          if (displayOnly) return
          event.preventDefault()
          setMenuPoint({ x: event.clientX, y: event.clientY })
        }}
        onKeyDown={event => {
          if (
            displayOnly ||
            (event.key !== "ContextMenu" &&
              !(event.shiftKey && event.key === "F10"))
          ) {
            return
          }

          event.preventDefault()
          const bounds = event.currentTarget.getBoundingClientRect()
          setMenuPoint({
            x: bounds.right,
            y: bounds.top,
          })
        }}
      >
        <div className="card__art">
          {imageUrl && !imageFailed ? (
            <img
              src={imageUrl}
              alt={cardName}
              draggable={false}
              loading="lazy"
              onError={event => {
                if (
                  event.currentTarget.currentSrc === imageUrl ||
                  event.currentTarget.src === imageUrl
                ) {
                  setImageFailed(true)
                }
              }}
            />
          ) : (
            <div className="card__fallback">
              <span>{cardName}</span>
              <small>
                {activeFace?.typeLine ??
                  definition.typeLine ??
                  "Kaartafbeelding niet beschikbaar"}
              </small>
              {definition.token?.power !== undefined &&
              definition.token.toughness !== undefined ? (
                <strong>
                  {definition.token.power}/{definition.token.toughness}
                </strong>
              ) : null}
            </div>
          )}
        </div>
        {counters.length > 0 ? (
          <div className="card__counters" aria-label="Counters">
            {counters.map(([counter, value]) => (
              <span key={counter}>
                {counter} ×{value}
              </span>
            ))}
          </div>
        ) : null}
        {attachedTargetName ? (
          <span className="card__attachment">↳ {attachedTargetName}</span>
        ) : null}
        {attachedCards.length > 0 ? (
          <span className="card__attachment-count">
            {attachedCards.length} gekoppeld
          </span>
        ) : null}
      </article>
      {actionMenu}
    </>
  )
}
