export const OFFLINE_ASSET_CACHE = "mtg-battle-offline-assets-v1"
export const AUTOMATIC_ASSET_CACHE = "mtg-battle-runtime-images-v1"

const offlineRequest = (assetKey: string) =>
  new Request(`/__offline_assets/${encodeURIComponent(assetKey)}`)

export type AssetCache = {
  put(assetKey: string, response: Response): Promise<void>
  match(
    assetKey: string,
    remoteUrl?: string,
  ): Promise<
    | {
        response: Response
        source: "offline-package" | "automatic-cache"
      }
    | undefined
  >
}

export const browserAssetCache: AssetCache = {
  async put(assetKey, response) {
    if (!("caches" in window)) {
      throw new Error("Cacheopslag wordt niet door deze browser ondersteund.")
    }
    const cache = await caches.open(OFFLINE_ASSET_CACHE)
    await cache.put(offlineRequest(assetKey), response)
  },
  async match(assetKey, remoteUrl) {
    if (!("caches" in window)) return undefined
    const explicit = await caches.match(offlineRequest(assetKey), {
      cacheName: OFFLINE_ASSET_CACHE,
    })
    if (explicit) {
      return { response: explicit, source: "offline-package" }
    }
    if (!remoteUrl) return undefined
    const automatic = await caches.match(remoteUrl, {
      cacheName: AUTOMATIC_ASSET_CACHE,
    })
    return automatic
      ? { response: automatic, source: "automatic-cache" }
      : undefined
  },
}
