import { useState } from "react"
import type { Zone } from "@mtg/game-core/types"
import { useBattleRuntime } from "./BattleRuntime"

const destinations: { zone: Zone; label: string }[] = [
  { zone: "battlefield", label: "Battlefield" },
  { zone: "hand", label: "Hand" },
  { zone: "graveyard", label: "Graveyard" },
  { zone: "exile", label: "Exile" },
  { zone: "library", label: "Library" },
  { zone: "command", label: "Command" },
]

export const SelectionToolbar = () => {
  const { actions, game, selectedCardIds, setSelectedCardIds } =
    useBattleRuntime()
  const [groupName, setGroupName] = useState("")
  if (selectedCardIds.length === 0) return null
  const cardsById = game.cardsById
  const singleCard =
    selectedCardIds.length === 1 ? cardsById[selectedCardIds[0] ?? ""] : null
  const singleDefinition = singleCard
    ? game.cardDefinitionsById[singleCard.definitionId]
    : null
  const battlefieldCards = selectedCardIds.flatMap(instanceId => {
    const card = cardsById[instanceId]
    return card?.zone === "battlefield" ? [card] : []
  })
  const selectionPlayerId = battlefieldCards[0]?.controllerId
  const canCreateGroup =
    battlefieldCards.length >= 2 &&
    battlefieldCards.every(card => card.controllerId === selectionPlayerId)
  const playerGroups = Object.values(game.groupsById).filter(
    group => group.playerId === selectionPlayerId,
  )
  const currentGroup = singleCard
    ? Object.values(game.groupsById).find(group =>
        group.cardIds.includes(singleCard.instanceId),
      )
    : undefined

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
            actions.moveCards(
              selectedCardIds.flatMap(instanceId => {
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
            )
            setSelectedCardIds([])
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
          actions.toggleSelectedTap(selectedCardIds)
        }}
      >
        Tap/untap
      </button>
      {singleCard && singleDefinition && singleDefinition.faces.length > 1 ? (
        <button
          type="button"
          onClick={() => {
            actions.switchFace(singleCard.instanceId)
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
              actions.setCounter(
                singleCard.instanceId,
                "+1/+1",
                (singleCard.counters["+1/+1"] ?? 0) + 1,
              )
            }}
          >
            +1/+1
          </button>
          <button
            type="button"
            onClick={() => {
              actions.changeStackOrder(singleCard.instanceId, "front")
            }}
          >
            Naar voren
          </button>
          <button
            type="button"
            onClick={() => {
              actions.changeStackOrder(singleCard.instanceId, "back")
            }}
          >
            Naar achteren
          </button>
        </>
      ) : null}
      {canCreateGroup && selectionPlayerId ? (
        <form
          className="selection-toolbar__group"
          onSubmit={event => {
            event.preventDefault()
            actions.createGroup(
              selectionPlayerId,
              battlefieldCards.map(card => card.instanceId),
              groupName,
            )
            setGroupName("")
            setSelectedCardIds([])
          }}
        >
          <input
            aria-label="Naam van nieuwe kaartgroep"
            placeholder="Groepsnaam (optioneel)"
            value={groupName}
            onChange={event => {
              setGroupName(event.target.value)
            }}
          />
          <button type="submit">Groep maken</button>
        </form>
      ) : null}
      {battlefieldCards.length > 0 && playerGroups.length > 0 ? (
        <label>
          <span className="sr-only">Voeg selectie toe aan groep</span>
          <select
            defaultValue=""
            aria-label="Voeg selectie toe aan groep"
            onChange={event => {
              actions.addToGroup(
                event.target.value,
                battlefieldCards.map(card => card.instanceId),
              )
              setSelectedCardIds([])
            }}
          >
            <option value="" disabled>
              Aan groep toevoegen…
            </option>
            {playerGroups.map(group => (
              <option key={group.id} value={group.id}>
                {group.name ?? "Naamloze groep"}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {singleCard && currentGroup ? (
        <button
          type="button"
          onClick={() => {
            actions.removeFromGroup(currentGroup.id, [singleCard.instanceId])
            setSelectedCardIds([])
          }}
        >
          Uit groep
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => {
          setSelectedCardIds([])
        }}
      >
        Selectie wissen
      </button>
      <small>Ctrl/⌘-klik of tik om kaarten te selecteren.</small>
    </aside>
  )
}
