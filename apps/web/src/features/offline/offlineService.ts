import { createAsyncThunk } from "@reduxjs/toolkit"
import { collectGameAssets } from "@mtg/game-core/assets"
import type {
  OfflineAssetRecord,
  OfflineBattlePackage,
} from "@mtg/game-core/types"
import { browserAssetCache } from "../../persistence/assetCache"
import { repositories } from "../../persistence/database"
import type { RootState } from "../../app/store"
import { archidektImportUrl } from "../../archidekt/endpoints"
import { updateOfflinePackage } from "./offlineSlice"

const activeDownloads = new Map<string, AbortController>()

export const offlineAssetFetchUrl = (assetUrl: string): string => {
  try {
    const url = new URL(assetUrl)
    if (url.hostname !== "card-images.archidekt.com") return assetUrl
    const match =
      /^\/normal\/(front|back)\/[0-9a-f]\/[0-9a-f]\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jpg$/i.exec(
        url.pathname,
      )
    const hash = url.search.slice(1)
    if (!match || !/^\d+$/.test(hash)) return assetUrl
    const [, face, cardId] = match
    return archidektImportUrl(`/image/${cardId}?face=${face}&hash=${hash}`)
  } catch {
    return assetUrl
  }
}

const persistPackage = async (
  record: OfflineBattlePackage,
  dispatch: (action: ReturnType<typeof updateOfflinePackage>) => void,
) => {
  await repositories.offlinePackages.save(record)
  dispatch(updateOfflinePackage(structuredClone(record)))
}

const storagePermission = async (): Promise<
  OfflineBattlePackage["persistentStorage"]
> => {
  if (!navigator.storage?.persist) return "unsupported"
  return (await navigator.storage.persist()) ? "granted" : "denied"
}

const fetchAsset = async (
  asset: OfflineAssetRecord,
  signal: AbortSignal,
): Promise<{ bytes: number }> => {
  const timeout = new AbortController()
  const timer = window.setTimeout(() => {
    timeout.abort()
  }, 15_000)
  try {
    const response = await fetch(offlineAssetFetchUrl(asset.url), {
      mode: "cors",
      signal: AbortSignal.any([signal, timeout.signal]),
    })
    if (!response.ok) {
      throw new Error(`Afbeelding gaf HTTP ${response.status}.`)
    }
    const blob = await response.blob()
    await browserAssetCache.put(
      asset.assetKey,
      new Response(blob, {
        headers: {
          "Content-Type": response.headers.get("Content-Type") ?? "image/jpeg",
        },
      }),
    )
    await repositories.assets.save({
      assetKey: asset.assetKey,
      schemaVersion: 1,
      url: asset.url,
      cacheKind: "offline-package",
      bytes: blob.size,
      cachedAt: new Date().toISOString(),
    })
    return { bytes: blob.size }
  } finally {
    window.clearTimeout(timer)
  }
}

export const downloadOfflineBattle = createAsyncThunk<
  OfflineBattlePackage,
  void,
  { state: RootState; rejectValue: string }
>(
  "offline/download",
  async (_argument, { dispatch, getState, rejectWithValue }) => {
    const game = getState().game.present
    if (!game) return rejectWithValue("Er is geen actieve battle.")

    const existing = getState().offline.current
    const imageRefs = collectGameAssets(game)
    const now = new Date().toISOString()
    const packageId = existing?.id ?? `offline-${crypto.randomUUID()}`
    const existingAssets = existing?.assets ?? {}
    const assets = Object.fromEntries(
      imageRefs.map(image => {
        const previous = existingAssets[image.assetKey]
        return [
          image.assetKey,
          previous?.status === "complete"
            ? previous
            : {
                assetKey: image.assetKey,
                url: image.url,
                status: "queued" as const,
              },
        ]
      }),
    )
    const record: OfflineBattlePackage = {
      id: packageId,
      schemaVersion: 1,
      version: 1,
      title: game.title,
      deckSnapshotIds: game.deckSnapshotIds,
      currentGameId: game.id,
      assetIds: Object.keys(assets),
      assets,
      status: "downloading",
      totalAssets: Object.keys(assets).length,
      completedAssets: Object.values(assets).filter(
        asset => asset.status === "complete",
      ).length,
      failedAssets: 0,
      downloadedBytes: Object.values(assets).reduce(
        (total, asset) => total + (asset.bytes ?? 0),
        0,
      ),
      persistentStorage: await storagePermission(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    const controller = new AbortController()
    activeDownloads.get(packageId)?.abort()
    activeDownloads.set(packageId, controller)
    await persistPackage(record, dispatch)

    const queue = Object.values(record.assets).filter(
      asset => asset.status !== "complete",
    )
    let cursor = 0
    const worker = async () => {
      while (cursor < queue.length && !controller.signal.aborted) {
        const asset = queue[cursor]
        cursor += 1
        if (!asset) continue
        asset.status = "downloading"
        record.updatedAt = new Date().toISOString()
        await persistPackage(record, dispatch)
        try {
          const { bytes } = await fetchAsset(asset, controller.signal)
          asset.status = "complete"
          asset.bytes = bytes
          asset.error = undefined
          record.completedAssets += 1
          record.downloadedBytes += bytes
        } catch (error) {
          if (controller.signal.aborted) break
          asset.status = "failed"
          asset.error =
            error instanceof Error ? error.message : "Onbekende downloadfout."
          record.failedAssets += 1
        }
        record.updatedAt = new Date().toISOString()
        await persistPackage(record, dispatch)
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(4, Math.max(queue.length, 1)) }, worker),
    )

    record.status = controller.signal.aborted
      ? "cancelled"
      : record.failedAssets > 0
        ? "failed"
        : "complete"
    record.updatedAt = new Date().toISOString()
    activeDownloads.delete(packageId)
    await persistPackage(record, dispatch)
    return record
  },
)

export const cancelOfflineDownload = createAsyncThunk<
  OfflineBattlePackage | null,
  void,
  { state: RootState }
>("offline/cancel", async (_argument, { dispatch, getState }) => {
  const record = getState().offline.current
  if (!record) return null
  activeDownloads.get(record.id)?.abort()
  const cancelled: OfflineBattlePackage = {
    ...record,
    status: "cancelled",
    updatedAt: new Date().toISOString(),
  }
  await persistPackage(cancelled, dispatch)
  return cancelled
})
