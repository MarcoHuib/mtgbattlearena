import { useDroppable } from "@dnd-kit/react"
import { useMemo } from "react"
import type {
  CardDefinition,
  CardInstance,
  PlayerId,
  Zone,
} from "@mtg/game-core/types"
import {
  fallbackBattlefieldPosition,
  positionForPerspective,
  safeBattlefieldPosition,
} from "./battlefieldPosition"
import { CardView } from "./CardView"
import { CardGroupOverlay } from "./CardGroupOverlay"
import { CommanderTaxControl } from "./CommanderTaxControl"
import { ZoneBrowseMenu } from "./ZoneBrowseMenu"
import { canControlPlayer, useBattleRuntime } from "./BattleRuntime"

type ZoneAreaProps = {
  playerId: PlayerId
  zone: Zone
  title: string
  instances: CardInstance[]
  definitions: Record<string, CardDefinition>
  compact?: boolean
  countOnly?: boolean
  faceUpStack?: boolean
  orientation?: "self" | "opponent"
  onOpen?: () => void
  onSearch?: () => void
  onActions?: (request: {
    point: { x: number; y: number }
    position?: { x: number; y: number }
  }) => void
}

const isBackground = (
  instance: CardInstance,
  definitions: Record<string, CardDefinition>,
) => {
  const definition = definitions[instance.definitionId]
  return [
    definition?.typeLine,
    ...(definition?.faces.map(face => face.typeLine) ?? []),
  ]
    .filter(Boolean)
    .some(typeLine => /\bbackground\b/i.test(typeLine ?? ""))
}

export const ZoneArea = ({
  playerId,
  zone,
  title,
  instances,
  definitions,
  compact = false,
  countOnly = false,
  faceUpStack = false,
  orientation = "self",
  onOpen,
  onSearch,
  onActions,
}: ZoneAreaProps) => {
  const runtime = useBattleRuntime()
  const groupsById = runtime.game.groupsById
  const controllable = canControlPlayer(runtime, playerId)
  const visibleCount =
    runtime.hiddenZoneCounts[playerId]?.[zone] ?? instances.length
  const groups = useMemo(
    () =>
      zone === "battlefield"
        ? Object.values(groupsById).filter(group => group.playerId === playerId)
        : [],
    [groupsById, playerId, zone],
  )
  const { ref, isDropTarget } = useDroppable({
    id: `${playerId}-${zone}`,
    type: "zone",
    data: { playerId, zone },
    accept: "card",
    disabled: !controllable,
  })
  const displayedInstances =
    zone === "command"
      ? [...instances].sort(
          (first, second) =>
            Number(isBackground(first, definitions)) -
            Number(isBackground(second, definitions)),
        )
      : instances
  const hasCommanderGroup = zone === "command" && instances.length > 1
  const topInstance = faceUpStack ? instances.at(-1) : undefined
  const topDefinition = topInstance
    ? definitions[topInstance.definitionId]
    : undefined

  return (
    <section
      ref={ref}
      data-battle-drop-zone={zone}
      className={`zone zone--${zone} ${
        isDropTarget ? "zone--drop-target" : ""
      } ${hasCommanderGroup ? "zone--commander-group" : ""} ${
        faceUpStack ? "zone--face-up-stack" : ""
      }`}
      aria-label={`${title}, ${visibleCount} ${
        visibleCount === 1 ? "kaart" : "kaarten"
      }`}
      onContextMenu={event => {
        if (
          !controllable ||
          !onActions ||
          (event.target as HTMLElement).closest(
            ".card, .card-group-overlay, button, input, select",
          )
        ) {
          return
        }
        event.preventDefault()
        const cards = event.currentTarget.querySelector<HTMLElement>(
          ":scope > .zone__cards",
        )
        const bounds = cards?.getBoundingClientRect()
        onActions({
          point: { x: event.clientX, y: event.clientY },
          position: bounds
            ? {
                x: Math.max(
                  0,
                  Math.min(1, (event.clientX - bounds.left) / bounds.width),
                ),
                y: Math.max(
                  0,
                  Math.min(1, (event.clientY - bounds.top) / bounds.height),
                ),
              }
            : undefined,
        })
      }}
    >
      <div className="zone__label">
        <span>{title}</span>
        <strong>{visibleCount}</strong>
        {controllable && onOpen && onSearch ? (
          <ZoneBrowseMenu title={title} onBrowse={onOpen} onSearch={onSearch} />
        ) : controllable && (onActions || onOpen) ? (
          <button
            type="button"
            className="zone__menu-trigger"
            aria-label={`${title}-acties openen`}
            onClick={event => {
              if (onActions) {
                const bounds = event.currentTarget.getBoundingClientRect()
                onActions({
                  point: { x: bounds.right, y: bounds.bottom },
                  position:
                    zone === "battlefield" ? { x: 0.5, y: 0.5 } : undefined,
                })
              } else {
                onOpen?.()
              }
            }}
          >
            ⋮
          </button>
        ) : null}
      </div>
      {countOnly ? (
        <div className="card-stack" aria-hidden="true">
          <span />
          <span />
          <img src="/magic-card-back.webp" alt="" />
        </div>
      ) : faceUpStack ? (
        <div className="zone__cards zone__cards--face-up-stack">
          {topInstance && topDefinition ? (
            <div className="face-up-card-stack">
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <CardView
                instance={topInstance}
                definition={topDefinition}
                compact
                disableDrag={!controllable}
              />
            </div>
          ) : (
            <span className="zone__empty">Sleep hierheen</span>
          )}
        </div>
      ) : (
        <div className="zone__cards">
          {zone === "hand" &&
          !controllable &&
          visibleCount > instances.length ? (
            <div
              className="online-hidden-hand"
              aria-label={`${visibleCount} verborgen kaarten`}
            >
              {Array.from({
                length: Math.min(visibleCount - instances.length, 10),
              }).map((_, index) => (
                <img
                  key={index}
                  src="/magic-card-back.webp"
                  alt=""
                  aria-hidden="true"
                />
              ))}
              <strong>{visibleCount}</strong>
            </div>
          ) : null}
          {zone === "battlefield"
            ? groups.map(group => (
                <CardGroupOverlay key={group.id} group={group} />
              ))
            : null}
          {displayedInstances.map((instance, index) => {
            const definition = definitions[instance.definitionId]
            if (!definition) return null
            if (zone === "battlefield") {
              const group = groups.find(item =>
                item.cardIds.includes(instance.instanceId),
              )
              if (
                group?.collapsed &&
                group.cardIds[0] !== instance.instanceId
              ) {
                return null
              }
              const position = positionForPerspective(
                safeBattlefieldPosition(
                  instance.position ??
                    fallbackBattlefieldPosition(
                      index,
                      displayedInstances.length,
                    ),
                ),
                orientation,
              )
              return (
                <div
                  className={`battlefield-card-position ${
                    group ? "battlefield-card-position--grouped" : ""
                  } ${group?.collapsed ? "battlefield-card-position--pile" : ""}`}
                  data-position-x={position.x.toFixed(4)}
                  data-position-y={position.y.toFixed(4)}
                  key={instance.instanceId}
                  style={{
                    left: `${position.x * 100}%`,
                    top: `${position.y * 100}%`,
                    zIndex: position.z,
                  }}
                >
                  <CardView
                    instance={instance}
                    definition={definition}
                    disableDrag={!controllable}
                  />
                </div>
              )
            }
            return zone === "command" && instance.isCommander ? (
              <div className="command-card" key={instance.instanceId}>
                <CardView
                  instance={instance}
                  definition={definition}
                  compact={compact}
                  disableDrag={!controllable}
                />
                <CommanderTaxControl
                  instance={instance}
                  definition={definition}
                />
              </div>
            ) : (
              <CardView
                key={instance.instanceId}
                instance={instance}
                definition={definition}
                compact={compact}
                disableDrag={!controllable}
              />
            )
          })}
          {instances.length === 0 &&
          !(zone === "hand" && !controllable && visibleCount > 0) ? (
            <span className="zone__empty">Sleep hierheen</span>
          ) : null}
        </div>
      )}
    </section>
  )
}
