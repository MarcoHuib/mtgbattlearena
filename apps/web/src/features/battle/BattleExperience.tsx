import { useBattleRuntime } from "./BattleRuntime"
import { BattleTable } from "./BattleTable"
import { FirstPlayerRollScreen } from "./FirstPlayerRollScreen"

export const BattleExperience = () => {
  const { game } = useBattleRuntime()

  return game.firstPlayerRoll.status === "completed" ? (
    <BattleTable />
  ) : (
    <FirstPlayerRollScreen />
  )
}
