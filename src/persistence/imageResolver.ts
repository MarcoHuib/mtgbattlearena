import type { CardImageRef } from "../game-core/types"
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
  const cached = await browserAssetCache.match(image.assetKey, image.url)
  if (cached) {
    if (cached.source === "automatic-cache") {
      return {
        source: "automatic-cache",
        url: image.url,
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
  return online ? { source: "remote", url: image.url } : null
}
