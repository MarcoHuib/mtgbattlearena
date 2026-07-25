import { useAppDispatch, useAppSelector } from "../../app/hooks"
import { openingHandSizeAfterMulligan } from "../../game-core/game"
import type { PlayerId } from "../../game-core/types"
import { keepHand, mulliganHand } from "../game/gameSlice"
import { CardView } from "./CardView"

type OpeningHandDialogProps = {
  playerId: PlayerId
}

const randomSeed = () => {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return values[0] ?? Date.now()
}

export const OpeningHandDialog = ({ playerId }: OpeningHandDialogProps) => {
  const dispatch = useAppDispatch()
  const game = useAppSelector(state => state.game.present)
  if (!game) return null
  const player = game.players[playerId]
  const state = game.openingHands[playerId]
  const nextMulliganCount = state.mulliganCount + 1
  const nextHandSize = openingHandSizeAfterMulligan(nextMulliganCount)
  const cards = player.zones.hand.flatMap(instanceId => {
    const instance = game.cardsById[instanceId]
    const definition = instance
      ? game.cardDefinitionsById[instance.definitionId]
      : undefined
    return instance && definition ? [{ instance, definition }] : []
  })
  const playerNumber = playerId === "player-1" ? 1 : 2

  return (
    <div className="opening-hand-layer">
      <section
        className="opening-hand-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`opening-hand-title-${playerId}`}
      >
        <header>
          <div>
            <span className="eyebrow">Speler {playerNumber} van 2</span>
            <h2 id={`opening-hand-title-${playerId}`}>
              Openingshand van {player.name}
            </h2>
          </div>
          <div className="opening-hand-dialog__count" aria-live="polite">
            <strong>{cards.length}</strong>
            <span>kaarten</span>
          </div>
        </header>

        <p className="opening-hand-dialog__rule">
          De eerste twee mulligans blijven op zeven kaarten. Vanaf de derde
          mulligan krijg je telkens één kaart minder.
        </p>

        <div
          className="opening-hand-dialog__cards"
          aria-label={`Openingshand met ${cards.length} kaarten`}
        >
          {cards.map(({ instance, definition }) => (
            <CardView
              key={instance.instanceId}
              instance={instance}
              definition={definition}
              displayOnly
            />
          ))}
          {cards.length === 0 ? (
            <p>Deze openingshand bevat geen kaarten meer.</p>
          ) : null}
        </div>

        <footer>
          <div className="opening-hand-dialog__mulligan">
            <button
              className="button button--secondary"
              type="button"
              autoFocus
              disabled={cards.length === 0}
              onClick={() => {
                dispatch(mulliganHand({ playerId, seed: randomSeed() }))
              }}
            >
              Mulligan ({state.mulliganCount})
            </button>
            <span>Nieuwe hand: {nextHandSize} kaarten</span>
          </div>
          <button
            className="button button--primary button--large"
            type="button"
            onClick={() => {
              dispatch(keepHand({ playerId }))
            }}
          >
            Deze hand houden
          </button>
        </footer>
      </section>
    </div>
  )
}
