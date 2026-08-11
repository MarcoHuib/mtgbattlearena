import type { CardDefinition, DeckSnapshot, ImportedDeck } from "./types"

export const createDeckSnapshot = (
  deck: ImportedDeck,
  id: string,
  identity?: { deckSourceId: string; revisionId: string },
): DeckSnapshot => ({
  ...structuredClone(deck),
  id,
  ...identity,
  schemaVersion: 1,
})

export const commanderDefinitions = (deck: ImportedDeck): CardDefinition[] => {
  const commanderIds = new Set(
    deck.cards.filter(card => card.isCommander).map(card => card.definitionId),
  )
  return deck.definitions.filter(definition => commanderIds.has(definition.id))
}

export const deckCardCount = (deck: ImportedDeck): number =>
  deck.cards.reduce((total, card) => total + card.quantity, 0)
