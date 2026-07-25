import { useState } from "react"
import { useAppDispatch, useAppSelector } from "../../app/hooks"
import type { PlayerId } from "../../game-core/types"
import {
  changeDamage,
  changePoison,
  changeTax,
  drawCard,
  mill,
  shufflePlayerLibrary,
  untapAll,
} from "../game/gameSlice"

type PlayerControlsProps = {
  playerId: PlayerId
}

const randomSeed = () => {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return values[0] ?? Date.now()
}

export const PlayerControls = ({ playerId }: PlayerControlsProps) => {
  const dispatch = useAppDispatch()
  const game = useAppSelector(state => state.game.present)
  const [amount, setAmount] = useState(1)
  if (!game) return null

  const player = game.players[playerId]
  const opponentId: PlayerId = playerId === "player-1" ? "player-2" : "player-1"
  const opponent = game.players[opponentId]
  const commanders = Object.keys(player.commanderTax)
  const opposingCommanders = Object.keys(opponent.commanderTax)
  const normalizedAmount = Math.max(1, Math.min(99, Math.floor(amount) || 1))
  return (
    <div className="player-controls">
      <div
        className="player-controls__quick"
        aria-label={`Acties ${player.name}`}
      >
        <button
          type="button"
          onClick={() => {
            dispatch(drawCard({ playerId }))
          }}
        >
          Trek 1
        </button>
        <label>
          <span className="sr-only">Aantal kaarten voor {player.name}</span>
          <input
            type="number"
            min="1"
            max="99"
            value={amount}
            onChange={event => {
              const value = event.target.valueAsNumber
              setAmount(Number.isFinite(value) ? value : 1)
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            dispatch(drawCard({ playerId, amount: normalizedAmount }))
          }}
        >
          Trek X
        </button>
        <button
          type="button"
          onClick={() => {
            dispatch(mill({ playerId, amount: normalizedAmount }))
          }}
        >
          Mill X
        </button>
        <button
          type="button"
          onClick={() => {
            dispatch(shufflePlayerLibrary({ playerId, seed: randomSeed() }))
          }}
        >
          Schud
        </button>
        <button
          type="button"
          onClick={() => {
            dispatch(untapAll({ playerId }))
          }}
        >
          Untap alles
        </button>
      </div>

      <div className="status-counter" aria-label={`Poison van ${player.name}`}>
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
        <strong>{player.poison}</strong>
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

      {commanders.length > 0 ? (
        <details className="commander-tracker">
          <summary>Commander tax</summary>
          {commanders.map(commanderId => {
            const definition =
              game.cardDefinitionsById[
                game.cardsById[commanderId]?.definitionId ?? ""
              ]
            const value = player.commanderTax[commanderId] ?? 0
            return (
              <div className="status-counter" key={commanderId}>
                <span title={definition?.name}>
                  {definition?.name ?? "Commander"}
                </span>
                <button
                  type="button"
                  disabled={value === 0}
                  aria-label={`Verlaag commander tax van ${definition?.name ?? "commander"}`}
                  onClick={() => {
                    dispatch(changeTax({ playerId, commanderId, delta: -2 }))
                  }}
                >
                  −
                </button>
                <strong>{value}</strong>
                <button
                  type="button"
                  aria-label={`Verhoog commander tax van ${definition?.name ?? "commander"}`}
                  onClick={() => {
                    dispatch(changeTax({ playerId, commanderId, delta: 2 }))
                  }}
                >
                  +
                </button>
              </div>
            )
          })}
        </details>
      ) : null}

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
              <div className="status-counter" key={commanderId}>
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
                <strong>{value}</strong>
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
    </div>
  )
}
