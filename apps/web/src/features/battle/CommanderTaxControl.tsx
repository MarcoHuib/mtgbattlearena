import { useAppDispatch, useAppSelector } from "../../app/hooks"
import type { CardDefinition, CardInstance } from "@mtg/game-core/types"
import { changeTax } from "../game/gameSlice"

type CommanderTaxControlProps = {
  instance: CardInstance
  definition: CardDefinition
}

export const CommanderTaxControl = ({
  instance,
  definition,
}: CommanderTaxControlProps) => {
  const dispatch = useAppDispatch()
  const value = useAppSelector(
    state =>
      state.game.present?.players[instance.ownerId].commanderTax[
        instance.instanceId
      ] ?? 0,
  )

  return (
    <div
      className="commander-tax-control"
      aria-label={`Commander tax van ${definition.name}`}
    >
      <span>Tax</span>
      <button
        type="button"
        disabled={value === 0}
        aria-label={`Verlaag commander tax van ${definition.name}`}
        onClick={() => {
          dispatch(
            changeTax({
              playerId: instance.ownerId,
              commanderId: instance.instanceId,
              delta: -2,
            }),
          )
        }}
      >
        −
      </button>
      <strong>{value}</strong>
      <button
        type="button"
        aria-label={`Verhoog commander tax van ${definition.name}`}
        onClick={() => {
          dispatch(
            changeTax({
              playerId: instance.ownerId,
              commanderId: instance.instanceId,
              delta: 2,
            }),
          )
        }}
      >
        +
      </button>
    </div>
  )
}
