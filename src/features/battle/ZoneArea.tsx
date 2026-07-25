import { useDroppable } from "@dnd-kit/react"
import { useMemo } from "react"
import { useAppSelector } from "../../app/hooks"
import type {
  CardDefinition,
  CardInstance,
  PlayerId,
  Zone,
} from "../../game-core/types"
import {
  fallbackBattlefieldPosition,
  safeBattlefieldPosition,
} from "./battlefieldPosition"
import { CardView } from "./CardView"
import { CardGroupOverlay } from "./CardGroupOverlay"

type ZoneAreaProps = {
  playerId: PlayerId
  zone: Zone
  title: string
  instances: CardInstance[]
  definitions: Record<string, CardDefinition>
  compact?: boolean
  countOnly?: boolean
  onOpen?: () => void
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
  onOpen,
  onActions,
}: ZoneAreaProps) => {
  const groupsById = useAppSelector(state => state.game.present?.groupsById)
  const groups = useMemo(
    () =>
      zone === "battlefield"
        ? Object.values(groupsById ?? {}).filter(
            group => group.playerId === playerId,
          )
        : [],
    [groupsById, playerId, zone],
  )
  const { ref, isDropTarget } = useDroppable({
    id: `${playerId}-${zone}`,
    type: "zone",
    data: { playerId, zone },
    accept: "card",
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

  return (
    <section
      ref={ref}
      className={`zone zone--${zone} ${
        isDropTarget ? "zone--drop-target" : ""
      } ${hasCommanderGroup ? "zone--commander-group" : ""}`}
      aria-label={`${title}, ${instances.length} kaarten`}
      onContextMenu={event => {
        if (
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
        <strong>{instances.length}</strong>
        {onActions || onOpen ? (
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
      ) : (
        <div className="zone__cards">
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
              const position = safeBattlefieldPosition(
                instance.position ??
                  fallbackBattlefieldPosition(index, displayedInstances.length),
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
                  <CardView instance={instance} definition={definition} />
                </div>
              )
            }
            return (
              <CardView
                key={instance.instanceId}
                instance={instance}
                definition={definition}
                compact={compact}
              />
            )
          })}
          {instances.length === 0 ? (
            <span className="zone__empty">Sleep hierheen</span>
          ) : null}
        </div>
      )}
    </section>
  )
}
