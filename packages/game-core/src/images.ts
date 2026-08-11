/* eslint-disable @typescript-eslint/no-deprecated */
import type { CardDefinition, CardImageRef, DeckSnapshot } from "./types"

export const CARD_IMAGE_CDN_ORIGIN = "https://cdn.mtgbattlearena.nl"
export const SCRYFALL_IMAGE_RESOLVER = 1

const printingId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const legacyAssetKey =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):(0|1):(normal)$/i

type PersistedImageRef = Partial<CardImageRef> & {
  assetKey?: unknown
  url?: unknown
}

type PersistedDefinition = CardDefinition & { scryfallId?: unknown }
export type NormalizedCardImageRef = CardImageRef & {
  resolver: number
  imageId: string
}

const validFaceIndex = (value: unknown): value is 0 | 1 =>
  value === 0 || value === 1

export const normalizeCardImageRef = (
  value: PersistedImageRef | undefined,
  fallbackPrintingId?: unknown,
  fallbackFaceIndex?: number,
): NormalizedCardImageRef | undefined => {
  const faceIndex = validFaceIndex(value?.faceIndex)
    ? value.faceIndex
    : validFaceIndex(fallbackFaceIndex)
      ? fallbackFaceIndex
      : undefined
  const variant = value?.variant === "normal" ? "normal" : undefined

  if (
    typeof value?.resolver === "number" &&
    Number.isInteger(value.resolver) &&
    value.resolver > 0 &&
    typeof value.imageId === "string" &&
    printingId.test(value.imageId) &&
    faceIndex !== undefined &&
    variant
  )
    return {
      resolver: value.resolver,
      imageId: value.imageId.toLowerCase(),
      faceIndex,
      variant,
    }

  if (typeof fallbackPrintingId === "string" && printingId.test(fallbackPrintingId))
    return {
      resolver: SCRYFALL_IMAGE_RESOLVER,
      imageId: fallbackPrintingId.toLowerCase(),
      faceIndex: faceIndex ?? 0,
      variant: variant ?? "normal",
    }

  if (typeof value?.assetKey === "string") {
    const match = legacyAssetKey.exec(value.assetKey)
    if (match) {
      const assetFaceIndex = Number(match[2])
      if (validFaceIndex(assetFaceIndex))
        return {
          resolver: SCRYFALL_IMAGE_RESOLVER,
          imageId: (match[1] ?? "").toLowerCase(),
          faceIndex: assetFaceIndex,
          variant: "normal",
        }
    }
  }

  return undefined
}

const requireNormalizedImageRef = (
  ref: CardImageRef,
): NormalizedCardImageRef => {
  const normalized = normalizeCardImageRef(ref)
  if (!normalized) throw new Error("Ongeldige kaartafbeeldingsreferentie.")
  return normalized
}

export const cardImageAssetKey = (ref: CardImageRef): string => {
  const normalized = requireNormalizedImageRef(ref)
  return `${normalized.resolver}:${normalized.imageId.toLowerCase()}:${normalized.faceIndex}:${normalized.variant}`
}

export const getCardImageUrl = (ref: CardImageRef): string => {
  const normalized = requireNormalizedImageRef(ref)
  return `${CARD_IMAGE_CDN_ORIGIN}/v1/${normalized.resolver}/${encodeURIComponent(normalized.imageId.toLowerCase())}/${normalized.faceIndex}/${normalized.variant}`
}

export const publicImageRef = (
  ref: PersistedImageRef | undefined,
): NormalizedCardImageRef | undefined =>
  normalizeCardImageRef(ref)

/** Persisted compatibility: the legacy URL is deliberately ignored. */
export const normalizeCardImages = (
  definition: PersistedDefinition,
): CardDefinition => {
  const refs = (definition.imageRefs ?? []).flatMap((ref, index) => {
    const normalized = normalizeCardImageRef(
      ref,
      definition.scryfallId,
      ref.faceIndex ?? index,
    )
    return normalized ? [normalized] : []
  })

  if (
    refs.length === 0 &&
    typeof definition.scryfallId === "string" &&
    printingId.test(definition.scryfallId)
  )
    for (let faceIndex = 0; faceIndex < definition.faces.length; faceIndex += 1) {
      const normalized = normalizeCardImageRef(
        undefined,
        definition.scryfallId,
        faceIndex,
      )
      if (normalized) refs.push(normalized)
    }

  const current = { ...definition } as PersistedDefinition & {
    scryfallId?: unknown
  }
  delete current.scryfallId
  return {
    ...current,
    faces: definition.faces.map(face => {
      const currentFace = { ...face }
      delete currentFace.imageUrl
      return currentFace
    }),
    imageRefs: [...new Map(refs.map(ref => [cardImageAssetKey(ref), ref])).values()],
  }
}

export const normalizeDeckSnapshotImages = (
  deck: DeckSnapshot,
): DeckSnapshot => ({
  ...deck,
  definitions: deck.definitions.map(normalizeCardImages),
})
