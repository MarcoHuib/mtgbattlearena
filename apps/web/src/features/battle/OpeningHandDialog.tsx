import {
  openingHandBottomCount,
  openingHandKeepCount,
  openingHandSizeAfterMulligan,
} from "@mtg/game-core/game"
import type { PlayerId } from "@mtg/game-core/types"
import { useEffect, useState } from "react"
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
  const requiredBottomCount = openingHandBottomCount(state.mulliganCount)
  const requiredKeepCount = openingHandKeepCount(state.mulliganCount)
  const [keptCardIds, setKeptCardIds] = useState<string[]>([])
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
  const selectionComplete =
    requiredBottomCount === 0 || keptCardIds.length === requiredKeepCount

  useEffect(() => {
    setKeptCardIds([])
  }, [state.mulliganCount])

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
          Je ziet na iedere mulligan opnieuw zeven kaarten. Na je eerste
          mulligan houd je er zeven; daarna houd je er telkens één minder.
        </p>

        {requiredBottomCount > 0 ? (
          <p className="opening-hand-dialog__selection" aria-live="polite">
            Kies {requiredKeepCount} kaart
            {requiredKeepCount === 1 ? "" : "en"} om te houden ·{" "}
            {keptCardIds.length}/{requiredKeepCount} geselecteerd
          </p>
        ) : null}

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
              displaySelected={keptCardIds.includes(instance.instanceId)}
              onDisplayClick={() => {
                if (!enabled) return
                setKeptCardIds(current =>
                  current.includes(instance.instanceId)
                    ? current.filter(id => id !== instance.instanceId)
                    : current.length < requiredKeepCount
                      ? [...current, instance.instanceId]
                      : current,
                )
              }}
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
            <span>
              Nog een mulligan: {nextHandSize} nieuwe kaarten, daarna{" "}
              {openingHandKeepCount(nextMulliganCount)} houden
            </span>
          </div>
          <button
            className="button button--primary button--large"
            type="button"
            disabled={!enabled || !selectionComplete}
            onClick={() => {
              const bottomCardIds =
                requiredBottomCount === 0
                  ? []
                  : cards
                      .map(({ instance }) => instance.instanceId)
                      .filter(instanceId => !keptCardIds.includes(instanceId))
              actions.keepHand(playerId, bottomCardIds)
            }}
          >
            {requiredBottomCount > 0
              ? `${requiredKeepCount} gekozen ${
                  requiredKeepCount === 1 ? "kaart" : "kaarten"
                } houden`
              : "Deze hand houden"}
          </button>
        </footer>
      </section>
    </div>
  )
}
