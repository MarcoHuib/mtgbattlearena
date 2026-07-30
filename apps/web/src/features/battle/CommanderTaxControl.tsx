import type { CardDefinition, CardInstance } from "@mtg/game-core/types"
import { canControlPlayer, useBattleRuntime } from "./BattleRuntime"

type CommanderTaxControlProps = {
  instance: CardInstance
  definition: CardDefinition
}

export const CommanderTaxControl = ({
  instance,
  definition,
}: CommanderTaxControlProps) => {
  const runtime = useBattleRuntime()
  const value =
    runtime.game.players[instance.ownerId].commanderTax[instance.instanceId] ??
    0
  const enabled = canControlPlayer(runtime, instance.ownerId)

  return (
    <div
      className="commander-tax-control"
      aria-label={`Commander tax van ${definition.name}`}
    >
      <span>Tax</span>
      <button
        type="button"
        disabled={!enabled || value === 0}
        aria-label={`Verlaag commander tax van ${definition.name}`}
        onClick={() => {
          runtime.actions.changeCommanderTax(
            instance.ownerId,
            instance.instanceId,
            -2,
          )
        }}
      >
        −
      </button>
      <strong>{value}</strong>
      <button
        type="button"
        disabled={!enabled}
        aria-label={`Verhoog commander tax van ${definition.name}`}
        onClick={() => {
          runtime.actions.changeCommanderTax(
            instance.ownerId,
            instance.instanceId,
            2,
          )
        }}
      >
        +
      </button>
    </div>
  )
}
