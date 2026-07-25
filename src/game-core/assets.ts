import type { CardDefinition, CardImageRef, GameState } from "./types"

export const deduplicateImageRefs = (
  definitions: readonly CardDefinition[],
): CardImageRef[] => {
  const assets = new Map<string, CardImageRef>()
  for (const definition of definitions) {
    for (const image of definition.imageRefs) {
      if (!assets.has(image.assetKey)) assets.set(image.assetKey, image)
    }
  }
  return [...assets.values()]
}

export const collectGameAssets = (game: GameState): CardImageRef[] =>
  deduplicateImageRefs(Object.values(game.cardDefinitionsById))
