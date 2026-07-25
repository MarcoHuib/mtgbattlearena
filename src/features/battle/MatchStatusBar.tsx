import { useAppDispatch, useAppSelector } from "../../app/hooks"
import type { DayNightStatus, PlayerId, TurnPhase } from "../../game-core/types"
import {
  nextPhase,
  nextTurn,
  setDayNight,
  setInitiative,
  setMonarch,
} from "../game/gameSlice"

const phaseLabels: Record<TurnPhase, string> = {
  beginning: "Beginfase",
  "precombat-main": "Eerste hoofdfase",
  combat: "Gevecht",
  "postcombat-main": "Tweede hoofdfase",
  ending: "Eindfase",
}

const holderValue = (value: string): PlayerId | null =>
  value === "player-1" || value === "player-2" ? value : null

export const MatchStatusBar = () => {
  const dispatch = useAppDispatch()
  const game = useAppSelector(state => state.game.present)
  if (!game) return null

  const openingHandsKept =
    game.openingHands["player-1"].kept && game.openingHands["player-2"].kept
  const activePlayer = game.players[game.activePlayerId]

  return (
    <section className="match-status" aria-label="Matchstatus">
      <div className="match-status__turn">
        <span className="eyebrow">Aan de beurt</span>
        <strong>{activePlayer.name}</strong>
        <small>
          Beurt {game.turnNumber} · {phaseLabels[game.phase]}
        </small>
      </div>

      <label>
        <span>Monarch</span>
        <select
          aria-label="Monarch-houder"
          value={game.matchStatus.monarchPlayerId ?? "none"}
          onChange={event => {
            dispatch(setMonarch({ playerId: holderValue(event.target.value) }))
          }}
        >
          <option value="none">Niemand</option>
          <option value="player-1">{game.players["player-1"].name}</option>
          <option value="player-2">{game.players["player-2"].name}</option>
        </select>
      </label>

      <label>
        <span>Initiative</span>
        <select
          aria-label="Initiative-houder"
          value={game.matchStatus.initiativePlayerId ?? "none"}
          onChange={event => {
            dispatch(
              setInitiative({ playerId: holderValue(event.target.value) }),
            )
          }}
        >
          <option value="none">Niemand</option>
          <option value="player-1">{game.players["player-1"].name}</option>
          <option value="player-2">{game.players["player-2"].name}</option>
        </select>
      </label>

      <label>
        <span>Dag / nacht</span>
        <select
          aria-label="Dag- en nachtstatus"
          value={game.matchStatus.dayNight}
          onChange={event => {
            dispatch(
              setDayNight({
                status: event.target.value as DayNightStatus,
              }),
            )
          }}
        >
          <option value="none">Geen</option>
          <option value="day">Dag</option>
          <option value="night">Nacht</option>
        </select>
      </label>

      <div className="match-status__actions">
        <button
          type="button"
          disabled={!openingHandsKept}
          onClick={() => {
            dispatch(nextPhase())
          }}
        >
          Volgende fase
        </button>
        <button
          type="button"
          disabled={!openingHandsKept}
          onClick={() => {
            dispatch(nextTurn())
          }}
        >
          Volgende beurt →
        </button>
      </div>
    </section>
  )
}
