import type { CardDefinition, CardImageRef, GameState } from "./types"
import { cardImageAssetKey } from "./images"

export const deduplicateImageRefs = (
  definitions: readonly CardDefinition[],
): CardImageRef[] => {
  const assets = new Map<string, CardImageRef>()
  for (const definition of definitions) {
    for (const image of definition.imageRefs) {
      const key = cardImageAssetKey(image)
      if (!assets.has(key)) assets.set(key, image)
    }
  }
  return [...assets.values()]
}

export const collectGameAssets = (game: GameState): CardImageRef[] =>
  deduplicateImageRefs(Object.values(game.cardDefinitionsById))
