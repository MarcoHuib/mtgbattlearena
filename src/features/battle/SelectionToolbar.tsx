import { useAppDispatch, useAppSelector } from "../../app/hooks"
import type { Zone } from "../../game-core/types"
import {
  changeStackOrder,
  moveGameCards,
  setCounter,
  switchFace,
  toggleSelectedTap,
} from "../game/gameSlice"
import { clearCardSelection } from "../ui/uiSlice"

const destinations: { zone: Zone; label: string }[] = [
  { zone: "battlefield", label: "Battlefield" },
  { zone: "hand", label: "Hand" },
  { zone: "graveyard", label: "Graveyard" },
  { zone: "exile", label: "Exile" },
  { zone: "library", label: "Library" },
  { zone: "command", label: "Command" },
]

export const SelectionToolbar = () => {
  const dispatch = useAppDispatch()
  const selectedCardIds = useAppSelector(state => state.ui.selectedCardIds)
  const game = useAppSelector(state => state.game.present)
  if (selectedCardIds.length === 0 || !game) return null
  const cardsById = game.cardsById
  const singleCard =
    selectedCardIds.length === 1 ? cardsById[selectedCardIds[0] ?? ""] : null
  const singleDefinition = singleCard
    ? game.cardDefinitionsById[singleCard.definitionId]
    : null

  return (
    <aside className="selection-toolbar" aria-live="polite">
      <strong>{selectedCardIds.length} geselecteerd</strong>
      <label>
        <span className="sr-only">Verplaats geselecteerde kaarten</span>
        <select
          defaultValue=""
          aria-label="Verplaats geselecteerde kaarten"
          onChange={event => {
            const zone = event.target.value as Zone
            dispatch(
              moveGameCards({
                moves: selectedCardIds.flatMap(instanceId => {
                  const card = cardsById[instanceId]
                  return card
                    ? [
                        {
                          instanceId,
                          playerId: card.controllerId,
                          zone,
                        },
                      ]
                    : []
                }),
              }),
            )
            dispatch(clearCardSelection())
          }}
        >
          <option value="" disabled>
            Samen verplaatsen…
          </option>
          {destinations.map(destination => (
            <option key={destination.zone} value={destination.zone}>
              Naar {destination.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => {
          dispatch(toggleSelectedTap({ instanceIds: selectedCardIds }))
        }}
      >
        Tap/untap
      </button>
      {singleCard && singleDefinition && singleDefinition.faces.length > 1 ? (
        <button
          type="button"
          onClick={() => {
            dispatch(switchFace({ instanceId: singleCard.instanceId }))
          }}
        >
          Kaartzijde
        </button>
      ) : null}
      {singleCard?.zone === "battlefield" ? (
        <>
          <button
            type="button"
            onClick={() => {
              dispatch(
                setCounter({
                  instanceId: singleCard.instanceId,
                  counter: "+1/+1",
                  value: (singleCard.counters["+1/+1"] ?? 0) + 1,
                }),
              )
            }}
          >
            +1/+1
          </button>
          <button
            type="button"
            onClick={() => {
              dispatch(
                changeStackOrder({
                  instanceId: singleCard.instanceId,
                  direction: "front",
                }),
              )
            }}
          >
            Naar voren
          </button>
          <button
            type="button"
            onClick={() => {
              dispatch(
                changeStackOrder({
                  instanceId: singleCard.instanceId,
                  direction: "back",
                }),
              )
            }}
          >
            Naar achteren
          </button>
        </>
      ) : null}
      <button
        type="button"
        onClick={() => {
          dispatch(clearCardSelection())
        }}
      >
        Selectie wissen
      </button>
      <small>Ctrl/⌘-klik of tik om kaarten te selecteren.</small>
    </aside>
  )
}
