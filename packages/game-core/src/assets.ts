import type { CardDefinition, CardImageRef, GameState } from "./types"
import { cardImageAssetKey, normalizeCardImageRef } from "./images"

export const deduplicateImageRefs = (
  definitions: readonly CardDefinition[],
): CardImageRef[] => {
  const assets = new Map<string, CardImageRef>()
  for (const definition of definitions) {
    for (const image of definition.imageRefs) {
      const normalized = normalizeCardImageRef(image)
      if (!normalized) continue
      const key = cardImageAssetKey(normalized)
      if (!assets.has(key)) assets.set(key, normalized)
    }
  }
  return [...assets.values()]
}

export const collectGameAssets = (game: GameState): CardImageRef[] =>
  deduplicateImageRefs(Object.values(game.cardDefinitionsById))
