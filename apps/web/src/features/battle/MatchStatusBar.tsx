import type { DayNightStatus, PlayerId, TurnPhase } from "@mtg/game-core/types"
import { battlePlayerIds, useBattleRuntime } from "./BattleRuntime"

const phaseLabels: Record<TurnPhase, string> = {
  beginning: "Beginfase",
  "precombat-main": "Eerste hoofdfase",
  combat: "Gevecht",
  "postcombat-main": "Tweede hoofdfase",
  ending: "Eindfase",
}

export const MatchStatusBar = () => {
  const { actions, game, mode, pending, viewerPlayerId } = useBattleRuntime()
  const playerIds = battlePlayerIds(game)
  const openingHandsKept = playerIds.every(
    playerId => game.openingHands[playerId]?.kept,
  )
  const holderValue = (value: string): PlayerId | null =>
    playerIds.includes(value) ? value : null
  const activePlayer = game.players[game.activePlayerId]
  const canAdvance =
    openingHandsKept &&
    !pending &&
    (mode === "offline" || viewerPlayerId === game.activePlayerId)

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
            actions.setMonarch(holderValue(event.target.value))
          }}
        >
          <option value="none">Niemand</option>
          {playerIds.map(playerId => (
            <option value={playerId} key={playerId}>
              {game.players[playerId].name}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Initiative</span>
        <select
          aria-label="Initiative-houder"
          value={game.matchStatus.initiativePlayerId ?? "none"}
          onChange={event => {
            actions.setInitiative(holderValue(event.target.value))
          }}
        >
          <option value="none">Niemand</option>
          {playerIds.map(playerId => (
            <option value={playerId} key={playerId}>
              {game.players[playerId].name}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Dag / nacht</span>
        <select
          aria-label="Dag- en nachtstatus"
          value={game.matchStatus.dayNight}
          onChange={event => {
            actions.setDayNight(event.target.value as DayNightStatus)
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
          disabled={!canAdvance}
          onClick={() => {
            actions.nextPhase()
          }}
        >
          Volgende fase
        </button>
        <button
          type="button"
          disabled={!canAdvance}
          onClick={() => {
            actions.nextTurn()
          }}
        >
          Volgende beurt →
        </button>
      </div>
    </section>
  )
}
