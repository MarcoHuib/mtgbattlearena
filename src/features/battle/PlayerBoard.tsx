import { useState } from "react"
import { useAppSelector } from "../../app/hooks"
import type { CardInstance, PlayerId, Zone } from "../../game-core/types"
import { PlayerControls } from "./PlayerControls"
import { ZoneActionMenu } from "./ZoneActionMenu"
import { ZoneArea } from "./ZoneArea"
import { ZoneBrowser } from "./ZoneBrowser"

type BrowsableZone = Extract<
  Zone,
  "library" | "graveyard" | "exile" | "command"
>

type PlayerBoardProps = {
  playerId: PlayerId
  orientation: "opponent" | "self"
}

export const PlayerBoard = ({ playerId, orientation }: PlayerBoardProps) => {
  const game = useAppSelector(state => state.game.present)
  const [browser, setBrowser] = useState<{
    zone: BrowsableZone
    search?: boolean
    topAmount?: number
  } | null>(null)
  const [actionMenu, setActionMenu] = useState<{
    kind: "library" | "battlefield"
    point: { x: number; y: number }
    position?: { x: number; y: number }
  } | null>(null)
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
      } ${player.disabled ? "player-board--disabled" : ""}`}
      aria-label={`Speelveld van ${player.name}`}
    >
      <aside className="player-rail">
        <div>
          <span className="eyebrow">
            {orientation === "self" ? "Speler één" : "Speler twee"}
          </span>
          <h2>{player.name}</h2>
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
            onOpen={() => {
              setBrowser({ zone: "command" })
            }}
          />
          <ZoneArea
            playerId={playerId}
            zone="exile"
            title="Exile"
            instances={instancesFor("exile")}
            definitions={game.cardDefinitionsById}
            compact
            onOpen={() => {
              setBrowser({ zone: "exile" })
            }}
          />
        </div>
        <ZoneArea
          playerId={playerId}
          zone="battlefield"
          title="Battlefield"
          instances={instancesFor("battlefield")}
          definitions={game.cardDefinitionsById}
          onActions={request => {
            setActionMenu({ kind: "battlefield", ...request })
          }}
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
          onActions={request => {
            setActionMenu({ kind: "library", ...request })
          }}
        />
        <ZoneArea
          playerId={playerId}
          zone="graveyard"
          title="Graveyard"
          instances={instancesFor("graveyard")}
          definitions={game.cardDefinitionsById}
          compact
          onOpen={() => {
            setBrowser({ zone: "graveyard" })
          }}
        />
      </aside>
      {browser ? (
        <ZoneBrowser
          playerId={playerId}
          zone={browser.zone}
          initialSearch={browser.search}
          initialTopAmount={browser.topAmount}
          onClose={() => {
            setBrowser(null)
          }}
        />
      ) : null}
      {actionMenu ? (
        <ZoneActionMenu
          playerId={playerId}
          kind={actionMenu.kind}
          point={actionMenu.point}
          battlefieldPosition={
            actionMenu.position ? { ...actionMenu.position, z: 0 } : undefined
          }
          onBrowseLibrary={options => {
            setBrowser({
              zone: "library",
              search: options?.search,
              topAmount: options?.topAmount,
            })
          }}
          onClose={() => {
            setActionMenu(null)
          }}
        />
      ) : null}
    </section>
  )
}
