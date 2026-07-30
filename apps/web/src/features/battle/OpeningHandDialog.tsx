import { openingHandSizeAfterMulligan } from "@mtg/game-core/game"
import type { PlayerId } from "@mtg/game-core/types"
import {
  battlePlayerIds,
  canControlPlayer,
  useBattleRuntime,
} from "./BattleRuntime"
import { CardView } from "./CardView"

type OpeningHandDialogProps = {
  playerId: PlayerId
}

export const OpeningHandDialog = ({ playerId }: OpeningHandDialogProps) => {
  const runtime = useBattleRuntime()
  const { actions, game } = runtime
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
  const playerIds = battlePlayerIds(game)
  const playerNumber = playerIds.indexOf(playerId) + 1
  const enabled = canControlPlayer(runtime, playerId)

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
            <span className="eyebrow">
              Speler {playerNumber} van {playerIds.length}
            </span>
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
              disabled={!enabled || cards.length === 0}
              onClick={() => {
                actions.mulligan(playerId)
              }}
            >
              Mulligan ({state.mulliganCount})
            </button>
            <span>Nieuwe hand: {nextHandSize} kaarten</span>
          </div>
          <button
            className="button button--primary button--large"
            type="button"
            disabled={!enabled}
            onClick={() => {
              actions.keepHand(playerId)
            }}
          >
            Deze hand houden
          </button>
        </footer>
      </section>
    </div>
  )
}
