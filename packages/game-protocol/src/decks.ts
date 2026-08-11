import type { DeckSnapshot } from "@mtg/game-core/types"
import {
  onlineDeckSubmissionSchema,
  type OnlineDeckSubmission,
} from "./schemas"

export const createOnlineDeckSubmission = (
  deck: DeckSnapshot,
): OnlineDeckSubmission => {
  const definitions = new Map(deck.definitions.map(item => [item.id, item]))
  return onlineDeckSubmissionSchema.parse({
    deckSnapshotId: deck.id,
    deckName: deck.name,
    cards: deck.cards.map(card => {
      const definition = definitions.get(card.definitionId)
      if (!definition)
        throw new Error(
          `Kaartdefinitie ${card.definitionId} ontbreekt in ${deck.name}.`,
        )
      return {
        definitionId: definition.id,
        name: definition.faces[0]?.name ?? definition.name,
        typeLine: definition.faces[0]?.typeLine ?? definition.typeLine,
        imageRefs: definition.imageRefs,
        faces: definition.faces.map(face => ({
          name: face.name,
          typeLine: face.typeLine,
          oracleText: face.oracleText,
        })),
        quantity: card.quantity,
        isCommander: card.isCommander,
      }
    }),
    tokens: deck.definitions
      .filter(item => item.token?.source === "deck")
      .map(definition => {
        return {
          definitionId: definition.id,
          name: definition.faces[0]?.name ?? definition.name,
          typeLine: definition.faces[0]?.typeLine ?? definition.typeLine,
          imageRef: definition.imageRefs[0],
          kind: definition.token?.kind ?? "other",
          power: definition.token?.power,
          toughness: definition.token?.toughness,
        }
      }),
  })
}
