import { useAppDispatch, useAppSelector } from "../../app/hooks"
import type { CardInstance, PlayerId, Zone } from "../../game-core/types"
import { changeLife } from "../game/gameSlice"
import { PlayerControls } from "./PlayerControls"
import { ZoneArea } from "./ZoneArea"

type PlayerBoardProps = {
  playerId: PlayerId
  orientation: "opponent" | "self"
}

export const PlayerBoard = ({ playerId, orientation }: PlayerBoardProps) => {
  const dispatch = useAppDispatch()
  const game = useAppSelector(state => state.game.present)
  if (!game) return null
  const player = game.players[playerId]
  const isActivePlayer = game.activePlayerId === playerId
  const instancesFor = (zone: Zone): CardInstance[] =>
    player.zones[zone].flatMap(instanceId => {
      const card = game.cardsById[instanceId]
      return card ? [card] : []
    })

  return (
    <section
      className={`player-board player-board--${orientation} ${
        isActivePlayer ? "player-board--active" : ""
      }`}
      aria-label={`Speelveld van ${player.name}`}
    >
      <aside className="player-rail">
        <div>
          <span className="eyebrow">
            {orientation === "self" ? "Speler één" : "Speler twee"}
          </span>
          <h2>{player.name}</h2>
          {isActivePlayer ? (
            <span className="turn-indicator">Aan de beurt</span>
          ) : null}
        </div>
        <div
          className="life-control"
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
        <PlayerControls playerId={playerId} />
      </aside>

      <div className="board-surface">
        <div className="edge-zones">
          <ZoneArea
            playerId={playerId}
            zone="command"
            title="Command"
            instances={instancesFor("command")}
            definitions={game.cardDefinitionsById}
            compact
          />
          <ZoneArea
            playerId={playerId}
            zone="exile"
            title="Exile"
            instances={instancesFor("exile")}
            definitions={game.cardDefinitionsById}
            compact
          />
        </div>
        <ZoneArea
          playerId={playerId}
          zone="battlefield"
          title="Battlefield"
          instances={instancesFor("battlefield")}
          definitions={game.cardDefinitionsById}
        />
        <ZoneArea
          playerId={playerId}
          zone="hand"
          title="Hand"
          instances={instancesFor("hand")}
          definitions={game.cardDefinitionsById}
          compact
        />
      </div>

      <aside className="pile-rail">
        <ZoneArea
          playerId={playerId}
          zone="library"
          title="Library"
          instances={instancesFor("library")}
          definitions={game.cardDefinitionsById}
          countOnly
        />
        <ZoneArea
          playerId={playerId}
          zone="graveyard"
          title="Graveyard"
          instances={instancesFor("graveyard")}
          definitions={game.cardDefinitionsById}
          compact
        />
      </aside>
    </section>
  )
}
