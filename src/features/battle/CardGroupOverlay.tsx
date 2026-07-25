import { useEffect, useState } from "react"
import { useAppDispatch } from "../../app/hooks"
import type { CardGroup } from "../../game-core/types"
import { dissolveGroup, moveGroup, updateGroup } from "../game/gameSlice"

export const CardGroupOverlay = ({ group }: { group: CardGroup }) => {
  const dispatch = useAppDispatch()
  const [name, setName] = useState(group.name ?? "")
  useEffect(() => {
    setName(group.name ?? "")
  }, [group.name])
  const nudge = (x: number, y: number) => {
    dispatch(
      moveGroup({
        groupId: group.id,
        position: {
          x: Math.max(0, Math.min(1, group.position.x + x)),
          y: Math.max(0, Math.min(1, group.position.y + y)),
          z: group.position.z,
        },
      }),
    )
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
          dispatch(updateGroup({ groupId: group.id, name }))
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
        <button type="submit">Opslaan</button>
      </form>
      <span>{group.cardIds.length} kaarten</span>
      <div className="card-group-overlay__actions">
        <button
          type="button"
          onClick={() =>
            dispatch(
              updateGroup({
                groupId: group.id,
                collapsed: !group.collapsed,
              }),
            )
          }
        >
          {group.collapsed ? "Uitklappen" : "Inklappen"}
        </button>
        <div aria-label="Groep verplaatsen">
          <button
            type="button"
            aria-label="Groep naar links"
            onClick={() => {
              nudge(-0.05, 0)
            }}
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Groep omhoog"
            onClick={() => {
              nudge(0, -0.05)
            }}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Groep omlaag"
            onClick={() => {
              nudge(0, 0.05)
            }}
          >
            ↓
          </button>
          <button
            type="button"
            aria-label="Groep naar rechts"
            onClick={() => {
              nudge(0.05, 0)
            }}
          >
            →
          </button>
        </div>
        <button
          type="button"
          onClick={() => dispatch(dissolveGroup({ groupId: group.id }))}
        >
          Groep opheffen
        </button>
      </div>
    </aside>
  )
}
