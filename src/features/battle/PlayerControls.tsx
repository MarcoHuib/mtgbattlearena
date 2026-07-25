import { useAppDispatch, useAppSelector } from "../../app/hooks"
import { getPlayerWarnings, isCreatureDefinition } from "../../game-core/game"
import type { OptionalPlayerTracker, PlayerId } from "../../game-core/types"
import {
  changeDamage,
  changeLife,
  changePoison,
  changeTracker,
  setCitysBlessing,
  setDisabled,
  setTrackerVisibility,
} from "../game/gameSlice"

type PlayerControlsProps = {
  playerId: PlayerId
}

const trackerLabels: Record<OptionalPlayerTracker, string> = {
  energy: "Energy",
  experience: "Experience",
  rad: "Rad",
}

const optionalTrackers = Object.keys(trackerLabels) as OptionalPlayerTracker[]

export const PlayerControls = ({ playerId }: PlayerControlsProps) => {
  const dispatch = useAppDispatch()
  const game = useAppSelector(state => state.game.present)
  if (!game) return null

  const player = game.players[playerId]
  const opponentId: PlayerId = playerId === "player-1" ? "player-2" : "player-1"
  const opponent = game.players[opponentId]
  const opposingCommanders = Object.keys(opponent.commanderTax).filter(
    commanderId => {
      const commander = game.cardsById[commanderId]
      return isCreatureDefinition(
        commander
          ? game.cardDefinitionsById[commander.definitionId]
          : undefined,
      )
    },
  )
  const warnings = getPlayerWarnings(game, playerId)

  return (
    <div className="player-controls">
      <div
        className={`life-control ${
          warnings.includes("life") ? "status-counter--warning" : ""
        }`}
        aria-label={`Levenspunten ${player.name}`}
      >
        <button
          type="button"
          aria-label={`Verlaag leven van ${player.name}`}
          onClick={() => {
            dispatch(changeLife({ playerId, delta: -1 }))
          }}
        >
          −
        </button>
        <span>
          <strong>{player.life}</strong>
          <small>leven</small>
        </span>
        <button
          type="button"
          aria-label={`Verhoog leven van ${player.name}`}
          onClick={() => {
            dispatch(changeLife({ playerId, delta: 1 }))
          }}
        >
          +
        </button>
      </div>

      <div
        className={`status-counter ${
          warnings.includes("poison") ? "status-counter--warning" : ""
        }`}
        aria-label={`Poison van ${player.name}`}
      >
        <span>Poison</span>
        <button
          type="button"
          aria-label={`Verlaag poison van ${player.name}`}
          disabled={player.poison === 0}
          onClick={() => {
            dispatch(changePoison({ playerId, delta: -1 }))
          }}
        >
          −
        </button>
        <strong>
          {player.poison} <small>/ 10</small>
        </strong>
        <button
          type="button"
          aria-label={`Verhoog poison van ${player.name}`}
          onClick={() => {
            dispatch(changePoison({ playerId, delta: 1 }))
          }}
        >
          +
        </button>
      </div>

      {optionalTrackers
        .filter(tracker => player.visibleTrackers[tracker])
        .map(tracker => (
          <div
            className="status-counter"
            key={tracker}
            aria-label={`${trackerLabels[tracker]} van ${player.name}`}
          >
            <span>{trackerLabels[tracker]}</span>
            <button
              type="button"
              aria-label={`Verlaag ${trackerLabels[tracker]} van ${player.name}`}
              disabled={player.trackers[tracker] === 0}
              onClick={() => {
                dispatch(changeTracker({ playerId, tracker, delta: -1 }))
              }}
            >
              −
            </button>
            <strong>{player.trackers[tracker]}</strong>
            <button
              type="button"
              aria-label={`Verhoog ${trackerLabels[tracker]} van ${player.name}`}
              onClick={() => {
                dispatch(changeTracker({ playerId, tracker, delta: 1 }))
              }}
            >
              +
            </button>
          </div>
        ))}

      <details className="tracker-settings">
        <summary>Optionele trackers</summary>
        <div>
          {optionalTrackers.map(tracker => (
            <label key={tracker}>
              <input
                type="checkbox"
                checked={player.visibleTrackers[tracker]}
                onChange={event => {
                  dispatch(
                    setTrackerVisibility({
                      playerId,
                      tracker,
                      visible: event.target.checked,
                    }),
                  )
                }}
              />
              {trackerLabels[tracker]}
            </label>
          ))}
        </div>
      </details>

      {opposingCommanders.length > 0 ? (
        <details className="commander-tracker">
          <summary>Commander damage</summary>
          {opposingCommanders.map(commanderId => {
            const definition =
              game.cardDefinitionsById[
                game.cardsById[commanderId]?.definitionId ?? ""
              ]
            const value = player.commanderDamage[commanderId] ?? 0
            return (
              <div
                className={`status-counter ${
                  value >= 21 ? "status-counter--warning" : ""
                }`}
                key={commanderId}
              >
                <span title={definition?.name}>
                  {definition?.name ?? "Commander"}
                </span>
                <button
                  type="button"
                  disabled={value === 0}
                  aria-label={`Verlaag commander damage door ${definition?.name ?? "commander"}`}
                  onClick={() => {
                    dispatch(
                      changeDamage({
                        damagedPlayerId: playerId,
                        commanderId,
                        delta: -1,
                      }),
                    )
                  }}
                >
                  −
                </button>
                <strong>
                  {value} <small>/ 21</small>
                </strong>
                <button
                  type="button"
                  aria-label={`Verhoog commander damage door ${definition?.name ?? "commander"}`}
                  onClick={() => {
                    dispatch(
                      changeDamage({
                        damagedPlayerId: playerId,
                        commanderId,
                        delta: 1,
                      }),
                    )
                  }}
                >
                  +
                </button>
              </div>
            )
          })}
        </details>
      ) : null}

      <div className="player-status-toggles">
        <button
          type="button"
          className={player.citysBlessing ? "is-active" : ""}
          aria-pressed={player.citysBlessing}
          onClick={() => {
            dispatch(
              setCitysBlessing({
                playerId,
                active: !player.citysBlessing,
              }),
            )
          }}
        >
          City&apos;s Blessing
        </button>
        <button
          type="button"
          className={player.disabled ? "is-disabled" : ""}
          aria-pressed={player.disabled}
          onClick={() => {
            dispatch(setDisabled({ playerId, disabled: !player.disabled }))
          }}
        >
          {player.disabled ? "Uitgeschakeld" : "Speler uitschakelen"}
        </button>
      </div>

      {warnings.length > 0 ? (
        <div className="player-warnings" role="status">
          {warnings.includes("life") ? <span>Leven is 0 of lager</span> : null}
          {warnings.includes("poison") ? (
            <span>Poison is 10 of hoger</span>
          ) : null}
          {warnings.includes("commander-damage") ? (
            <span>Commander damage is 21 of hoger</span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
