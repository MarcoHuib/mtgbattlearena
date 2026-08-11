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
      const firstFace = definition.faces[0]
      return {
        definitionId: definition.id,
        name: firstFace?.name ?? definition.name,
        typeLine: firstFace?.typeLine ?? definition.typeLine,
        imageUrl: firstFace?.imageUrl ?? definition.imageRefs[0]?.url,
        scryfallId: definition.scryfallId,
        faces: definition.faces.map((face, faceIndex) => ({
          ...face,
          imageUrl:
            face.imageUrl ??
            definition.imageRefs.find(ref => ref.faceIndex === faceIndex)?.url,
        })),
        quantity: card.quantity,
        isCommander: card.isCommander,
      }
    }),
    tokens: deck.definitions
      .filter(item => item.token?.source === "deck")
      .map(definition => {
        const firstFace = definition.faces[0]
        return {
          definitionId: definition.id,
          name: firstFace?.name ?? definition.name,
          typeLine: firstFace?.typeLine ?? definition.typeLine,
          imageUrl: firstFace?.imageUrl ?? definition.imageRefs[0]?.url,
          scryfallId: definition.scryfallId,
          kind: definition.token?.kind ?? "other",
          power: definition.token?.power,
          toughness: definition.token?.toughness,
        }
      }),
  })
}
