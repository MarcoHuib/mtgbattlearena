/* eslint-disable @typescript-eslint/no-deprecated, @typescript-eslint/no-unused-vars, @typescript-eslint/no-unnecessary-type-assertion */
import type { CardDefinition, CardImageRef } from "./types"

export const CARD_IMAGE_CDN_ORIGIN = "https://cdn.mtgbattlearena.nl"
export const SCRYFALL_IMAGE_RESOLVER = 1

const printingId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const cardImageAssetKey = (ref: CardImageRef): string =>
  ref.resolver && ref.imageId
    ? `${ref.resolver}:${ref.imageId.toLowerCase()}:${ref.faceIndex}:${ref.variant}`
    : ref.assetKey ?? `legacy:${ref.faceIndex}:${ref.variant}`

export const getCardImageUrl = (ref: CardImageRef): string =>
  `${CARD_IMAGE_CDN_ORIGIN}/v1/${ref.resolver ?? 1}/${encodeURIComponent((ref.imageId ?? "").toLowerCase())}/${ref.faceIndex}/${ref.variant}.webp`

export const publicImageRef = (ref: CardImageRef | undefined) =>
  ref?.resolver && ref.imageId
    ? { resolver: ref.resolver, imageId: ref.imageId, faceIndex: ref.faceIndex, variant: ref.variant }
    : undefined

type LegacyImageRef = Partial<CardImageRef> & { assetKey?: string; url?: string }
type LegacyDefinition = CardDefinition & { scryfallId?: string }

/** Read compatibility for pre-CDN snapshots. Identity comes from the printing ID, never the old URL. */
export const normalizeCardImages = (definition: LegacyDefinition): CardDefinition => {
  const refs = (definition.imageRefs as LegacyImageRef[]).flatMap((ref, index) => {
    if (ref.resolver === 1 && ref.imageId && printingId.test(ref.imageId)) {
      return [{ resolver: 1, imageId: ref.imageId.toLowerCase(), faceIndex: ref.faceIndex ?? index, variant: "normal" as const }]
    }
    if (definition.scryfallId && printingId.test(definition.scryfallId)) {
      return [{ resolver: 1, imageId: definition.scryfallId.toLowerCase(), faceIndex: ref.faceIndex ?? index, variant: "normal" as const }]
    }
    return []
  })
  if (!refs.length && definition.scryfallId && printingId.test(definition.scryfallId)) {
    for (let faceIndex = 0; faceIndex < definition.faces.length; faceIndex += 1)
      refs.push({ resolver: 1, imageId: definition.scryfallId.toLowerCase(), faceIndex, variant: "normal" })
  }
  const { scryfallId: _legacyId, ...current } = definition
  return {
    ...current,
    faces: definition.faces.map(({ imageUrl: _legacyUrl, ...face }) => face),
    imageRefs: refs,
  } as CardDefinition
}
