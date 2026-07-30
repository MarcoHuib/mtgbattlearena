import { useEffect, useState } from "react"
import type { CardGroup } from "@mtg/game-core/types"
import { canControlPlayer, useBattleRuntime } from "./BattleRuntime"

export const CardGroupOverlay = ({ group }: { group: CardGroup }) => {
  const runtime = useBattleRuntime()
  const { actions } = runtime
  const enabled = canControlPlayer(runtime, group.playerId)
  const [name, setName] = useState(group.name ?? "")
  useEffect(() => {
    setName(group.name ?? "")
  }, [group.name])
  const nudge = (x: number, y: number) => {
    actions.moveGroup(group.id, {
      x: Math.max(0, Math.min(1, group.position.x + x)),
      y: Math.max(0, Math.min(1, group.position.y + y)),
      z: group.position.z,
    })
  }
  return (
    <aside
      className={`card-group-overlay ${
        group.collapsed ? "card-group-overlay--collapsed" : ""
      }`}
      style={{
        left: `${group.position.x * 100}%`,
        top: `${group.position.y * 100}%`,
        zIndex: Math.max(1, group.position.z + 100),
      }}
      aria-label={`Kaartgroep ${group.name ?? "zonder naam"}`}
    >
      <form
        onSubmit={event => {
          event.preventDefault()
          actions.updateGroup(group.id, { name })
        }}
      >
        <input
          aria-label="Groepsnaam"
          value={name}
          placeholder="Naamloze groep"
          onChange={event => {
            setName(event.target.value)
          }}
        />
        <button type="submit" disabled={!enabled}>
          Opslaan
        </button>
      </form>
      <span>{group.cardIds.length} kaarten</span>
      <div className="card-group-overlay__actions">
        <button
          type="button"
          onClick={() => {
            actions.updateGroup(group.id, { collapsed: !group.collapsed })
          }}
          disabled={!enabled}
        >
          {group.collapsed ? "Uitklappen" : "Inklappen"}
        </button>
        <div aria-label="Groep verplaatsen">
          <button
            type="button"
            aria-label="Groep naar links"
            disabled={!enabled}
            onClick={() => {
              nudge(-0.05, 0)
            }}
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Groep omhoog"
            disabled={!enabled}
            onClick={() => {
              nudge(0, -0.05)
            }}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Groep omlaag"
            disabled={!enabled}
            onClick={() => {
              nudge(0, 0.05)
            }}
          >
            ↓
          </button>
          <button
            type="button"
            aria-label="Groep naar rechts"
            disabled={!enabled}
            onClick={() => {
              nudge(0.05, 0)
            }}
          >
            →
          </button>
        </div>
        <button
          type="button"
          disabled={!enabled}
          onClick={() => {
            actions.dissolveGroup(group.id)
          }}
        >
          Groep opheffen
        </button>
      </div>
    </aside>
  )
}
