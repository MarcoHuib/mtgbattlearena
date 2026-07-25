import { useDroppable } from "@dnd-kit/react"
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

type ZoneAreaProps = {
  playerId: PlayerId
  zone: Zone
  title: string
  instances: CardInstance[]
  definitions: Record<string, CardDefinition>
  compact?: boolean
  countOnly?: boolean
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
}: ZoneAreaProps) => {
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
    >
      <div className="zone__label">
        <span>{title}</span>
        <strong>{instances.length}</strong>
      </div>
      {countOnly ? (
        <div className="card-stack" aria-hidden="true">
          <span />
          <span />
          <img src="/magic-card-back.webp" alt="" />
        </div>
      ) : (
        <div className="zone__cards">
          {displayedInstances.map((instance, index) => {
            const definition = definitions[instance.definitionId]
            if (!definition) return null
            if (zone === "battlefield") {
              const position = safeBattlefieldPosition(
                instance.position ??
                  fallbackBattlefieldPosition(index, displayedInstances.length),
              )
              return (
                <div
                  className="battlefield-card-position"
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
