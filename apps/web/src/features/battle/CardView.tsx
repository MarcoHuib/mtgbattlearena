import { Feedback } from "@dnd-kit/dom"
import { useDraggable } from "@dnd-kit/react"
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import type { CardDefinition, CardInstance, Zone } from "@mtg/game-core/types"
import { useOnlineStatus } from "../../hooks/useOnlineStatus"
import { resolveCardImage } from "../../persistence/imageResolver"
import { canControlPlayer, useBattleRuntime } from "./BattleRuntime"
import { beginCardPointerSession } from "./cardPointerSession"

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

const CARD_DRAG_PLUGINS = [
  Feedback.configure({
    // De state wordt bij drop direct op de nieuwe zone/positie gerenderd.
    // Een tweede animatie naar de oude placeholder veroorzaakt dan een
    // zichtbare terugslag.
    dropAnimation: null,
  }),
]

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
  const runtime = useBattleRuntime()
  const { actions, game, selectedCardIds, setSelectedCardIds } = runtime
  const controllable = canControlPlayer(runtime, instance.controllerId)
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
    disabled: displayOnly || disableDrag || !controllable,
    plugins: CARD_DRAG_PLUGINS,
  })
  const cardName = activeFace?.name ?? definition.name
  const cardLabel = `${cardName}, ${zoneLabels[instance.zone]}${
    instance.tapped ? ", getapt" : ""
  }`
  const gameCards = game.cardsById
  const selected = selectedCardIds.includes(instance.instanceId)
  const destinationPlayer = instance.controllerId
  const attachedTarget = instance.attachedTo
    ? gameCards[instance.attachedTo]
    : undefined
  const attachedTargetName = attachedTarget
    ? game.cardDefinitionsById[attachedTarget.definitionId]?.name
    : undefined
  const attachedCards = Object.values(gameCards).filter(
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
        instanceId => gameCards[instanceId]?.controllerId === destinationPlayer,
      )
      if (selected && selectedInstances.length > 1) {
        actions.moveCards(
          selectedInstances.map(instanceId => ({
            instanceId,
            playerId: destinationPlayer,
            zone: value as Zone,
          })),
        )
        setSelectedCardIds([])
      } else {
        actions.moveCards([
          {
            instanceId: instance.instanceId,
            playerId: destinationPlayer,
            zone: value as Zone,
          },
        ])
      }
    }
    setMenuPoint(null)
  }

  const changeCounter = (counter: string, delta: number) => {
    actions.setCounter(
      instance.instanceId,
      counter,
      (instance.counters[counter] ?? 0) + delta,
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
                    actions.toggleTap(instance.instanceId)
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
                    actions.switchFace(instance.instanceId)
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
                      actions.changeStackOrder(instance.instanceId, "front")
                    }}
                  >
                    Naar voren
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      actions.changeStackOrder(instance.instanceId, "back")
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
                      {game.players[instance.controllerId].zones.battlefield
                        .filter(
                          instanceId => instanceId !== instance.instanceId,
                        )
                        .map(instanceId => {
                          const card = gameCards[instanceId]
                          const targetDefinition = card
                            ? game.cardDefinitionsById[card.definitionId]
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
                      actions.attach(instance.instanceId, attachmentTarget)
                      setAttachmentTarget("")
                    }}
                  >
                    Koppelen
                  </button>
                  {instance.attachedTo ? (
                    <button
                      type="button"
                      onClick={() => {
                        actions.detach(instance.instanceId)
                      }}
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
                    actions.duplicateToken(instance.instanceId)
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
        data-battle-card="true"
        data-battle-draggable={
          !displayOnly && !disableDrag && controllable ? "true" : "false"
        }
        tabIndex={0}
        onPointerDownCapture={event => {
          if (
            !displayOnly &&
            !disableDrag &&
            controllable &&
            event.button === 0
          ) {
            lastPointerWasTouch.current = event.pointerType === "touch"
            beginCardPointerSession(
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
            setSelectedCardIds(
              selected
                ? selectedCardIds.filter(
                    instanceId => instanceId !== instance.instanceId,
                  )
                : [...selectedCardIds, instance.instanceId],
            )
          }
          lastPointerWasTouch.current = false
        }}
        onDoubleClick={() => {
          if (!displayOnly && controllable && instance.zone === "battlefield") {
            actions.toggleTap(instance.instanceId)
          }
        }}
        onContextMenu={event => {
          if (displayOnly || !controllable) return
          event.preventDefault()
          setMenuPoint({ x: event.clientX, y: event.clientY })
        }}
        onKeyDown={event => {
          if (
            displayOnly ||
            !controllable ||
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
