import type { AppDispatch } from "../../app/store"
import type { BattlefieldPosition, PlayerId, Zone } from "@mtg/game-core/types"
import {
  changeLife,
  drawCard,
  moveGameCard,
  nextPhase,
  toggleTap,
} from "../game/gameSlice"

export type OfflineGameCommand =
  | { type: "DRAW_CARD"; playerId: PlayerId; amount?: number }
  | {
      type: "MOVE_CARD"
      playerId: PlayerId
      instanceId: string
      zone: Zone
      position?: BattlefieldPosition
    }
  | { type: "TOGGLE_TAP"; instanceId: string }
  | { type: "CHANGE_LIFE"; playerId: PlayerId; delta: number }
  | { type: "NEXT_PHASE" }

export type GameCommandDispatcher<TCommand, TResult = void> = {
  dispatch(command: TCommand): Promise<TResult>
}

export class OfflineGameCommandDispatcher implements GameCommandDispatcher<OfflineGameCommand> {
  constructor(private readonly reduxDispatch: AppDispatch) {}

  dispatch(command: OfflineGameCommand) {
    switch (command.type) {
      case "DRAW_CARD":
        this.reduxDispatch(
          drawCard({ playerId: command.playerId, amount: command.amount }),
        )
        break
      case "MOVE_CARD":
        this.reduxDispatch(
          moveGameCard({
            playerId: command.playerId,
            instanceId: command.instanceId,
            zone: command.zone,
            position: command.position,
          }),
        )
        break
      case "TOGGLE_TAP":
        this.reduxDispatch(toggleTap({ instanceId: command.instanceId }))
        break
      case "CHANGE_LIFE":
        this.reduxDispatch(
          changeLife({ playerId: command.playerId, delta: command.delta }),
        )
        break
      case "NEXT_PHASE":
        this.reduxDispatch(nextPhase())
        break
    }
    return Promise.resolve()
  }
}
