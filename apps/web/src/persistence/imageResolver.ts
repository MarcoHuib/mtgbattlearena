import type { CardImageRef } from "@mtg/game-core/types"
import { cardImageAssetKey, getCardImageUrl } from "@mtg/game-core/images"
import { browserAssetCache } from "./assetCache"

export type ResolvedImage = {
  source: "offline-package" | "automatic-cache" | "remote"
  url: string
  revoke?: () => void
}

export const resolveCardImage = async (
  image: CardImageRef | undefined,
  online: boolean,
): Promise<ResolvedImage | null> => {
  if (!image) return null
  const assetKey = cardImageAssetKey(image)
  const remoteUrl = getCardImageUrl(image)
  const cached = await browserAssetCache.match(assetKey, remoteUrl)
  if (cached) {
    if (cached.source === "automatic-cache") {
      return {
        source: "automatic-cache",
        url: remoteUrl,
      }
    }
    const objectUrl = URL.createObjectURL(await cached.response.blob())
    return {
      source: "offline-package",
      url: objectUrl,
      revoke: () => {
        URL.revokeObjectURL(objectUrl)
      },
    }
  }
  return online ? { source: "remote", url: remoteUrl } : null
}
