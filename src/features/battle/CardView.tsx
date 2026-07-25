import { useDraggable } from "@dnd-kit/react"
import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { useAppDispatch, useAppSelector } from "../../app/hooks"
import type { CardDefinition, CardInstance, Zone } from "../../game-core/types"
import { useOnlineStatus } from "../../hooks/useOnlineStatus"
import { resolveCardImage } from "../../persistence/imageResolver"
import { moveGameCard, setCounter, toggleTap } from "../game/gameSlice"
import {
  dragCorrectionAfterScale,
  relativePointInRectangle,
} from "./battlefieldPosition"

type CardViewProps = {
  instance: CardInstance
  definition: CardDefinition
  compact?: boolean
  displayOnly?: boolean
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
  window.setTimeout(() => {
    card.style.removeProperty(DRAG_OFFSET_X)
    card.style.removeProperty(DRAG_OFFSET_Y)
    card.style.removeProperty(DRAG_FOLLOW_X)
    card.style.removeProperty(DRAG_FOLLOW_Y)
    delete card.dataset.dragGrabX
    delete card.dataset.dragGrabY
    if (activePointerSession === session) {
      activePointerSession = null
      document.documentElement.classList.remove(POINTER_ACTIVE_CLASS)
    }
  }, 350)
}

const counterTypes = [
  { key: "+1/+1", label: "+1/+1" },
  { key: "-1/-1", label: "-1/-1" },
  { key: "loyalty", label: "Loyalty" },
  { key: "charge", label: "Charge" },
] as const

const getMenuStyle = ({ x, y }: MenuPoint): CSSProperties => {
  const width = Math.min(280, window.innerWidth - 24)
  const height = 430
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
}: CardViewProps) => {
  const dispatch = useAppDispatch()
  const online = useOnlineStatus()
  const imageRef = definition.imageRefs[instance.activeFaceIndex]
  const imageAssetKey = imageRef?.assetKey
  const remoteImageUrl = imageRef?.url
  const [imageUrl, setImageUrl] = useState<string | null>(
    online ? (remoteImageUrl ?? null) : null,
  )
  const [imageFailed, setImageFailed] = useState(false)
  const [menuPoint, setMenuPoint] = useState<MenuPoint | null>(null)
  const [pointerHeld, setPointerHeld] = useState(false)
  const { ref, isDragging } = useDraggable({
    id: displayOnly
      ? `display-only-${instance.instanceId}`
      : instance.instanceId,
    type: "card",
    data: { instanceId: instance.instanceId },
    disabled: displayOnly,
  })
  const cardLabel = `${definition.name}, ${zoneLabels[instance.zone]}${
    instance.tapped ? ", getapt" : ""
  }`
  const owner = useAppSelector(
    state => state.game.present?.cardsById[instance.instanceId]?.ownerId,
  )
  const destinationPlayer = instance.controllerId

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

  const options = useMemo(
    () =>
      (
        [
          "battlefield",
          "hand",
          "graveyard",
          "exile",
          ...(owner === instance.ownerId ? ["command" as const] : []),
        ] as Zone[]
      ).filter(zone => zone !== instance.zone),
    [instance.ownerId, instance.zone, owner],
  )

  const performAction = (value: string) => {
    if (value) {
      dispatch(
        moveGameCard({
          instanceId: instance.instanceId,
          playerId: destinationPlayer,
          zone: value as Zone,
        }),
      )
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
              {instance.zone === "battlefield" ? (
                <button
                  className="card-action-menu__primary"
                  type="button"
                  onClick={() => {
                    dispatch(toggleTap({ instanceId: instance.instanceId }))
                  }}
                >
                  <span>↻</span>
                  {instance.tapped ? "Untappen" : "Tappen"}
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
        }`}
        aria-label={cardLabel}
        aria-expanded={displayOnly ? undefined : menuPoint !== null}
        aria-haspopup={displayOnly ? undefined : "dialog"}
        aria-keyshortcuts={displayOnly ? undefined : "Shift+F10"}
        data-card-name={definition.name}
        tabIndex={0}
        onPointerDownCapture={event => {
          if (!displayOnly && event.button === 0) {
            beginPointerSession(
              event.currentTarget,
              { x: event.clientX, y: event.clientY },
              instance.tapped,
            )
            setPointerHeld(true)
          }
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
              alt={definition.name}
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
              <span>{definition.name}</span>
              <small>
                {definition.typeLine ?? "Kaartafbeelding niet beschikbaar"}
              </small>
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
        {instance.tapped ? <span className="card__state">Getapt</span> : null}
      </article>
      {actionMenu}
    </>
  )
}
