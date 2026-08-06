import type { CardFaceDefinition } from "@mtg/game-core/types"

type RawFace = {
  name?: string | null
  displayName?: string | null
  typeLine?: string
  type_line?: string
  oracleText?: string
  oracle_text?: string
  text?: string
  imageUri?: string | null
  image_uris?: { normal?: string | null }
}

type ResolveCardFacesInput = {
  name: string
  layout?: string
  explicitFaces?: readonly RawFace[]
  fallbackTypeLine?: string
  fallbackOracleText?: string
  frontImageUrl?: string
  scryfallId?: string
}

const FLIPPABLE_LAYOUTS = new Set([
  "transform",
  "modal_dfc",
  "double_faced_token",
  "reversible_card",
])

const ARCHIDEKT_IMAGE_HOSTS = new Set(["card-images.archidekt.com"])

const scryfallImageUrl = (scryfallId: string, faceIndex: number): string => {
  const face = faceIndex === 0 ? "front" : "back"
  return `https://cards.scryfall.io/normal/${face}/${scryfallId[0]}/${scryfallId[1]}/${encodeURIComponent(scryfallId)}.jpg`
}

export const deriveArchidektBackImageUrl = (
  frontImageUrl: string | undefined,
): string | undefined => {
  if (!frontImageUrl) return undefined
  try {
    const url = new URL(frontImageUrl)
    if (
      url.protocol !== "https:" ||
      !ARCHIDEKT_IMAGE_HOSTS.has(url.hostname) ||
      !/^\/normal\/front\/[0-9a-f]\/[0-9a-f]\/[0-9a-f-]+\.jpg$/i.test(
        url.pathname,
      )
    ) {
      return undefined
    }
    url.pathname = url.pathname.replace("/normal/front/", "/normal/back/")
    return url.toString()
  } catch {
    return undefined
  }
}

export const resolveCardFaces = ({
  name,
  layout,
  explicitFaces,
  fallbackTypeLine,
  fallbackOracleText,
  frontImageUrl,
  scryfallId,
}: ResolveCardFacesInput): CardFaceDefinition[] => {
  if (explicitFaces?.length) {
    return explicitFaces.map((face, faceIndex) => ({
      name:
        face.name ??
        face.displayName ??
        (faceIndex === 0 ? name : `${name} — achterkant`),
      typeLine: face.typeLine ?? face.type_line ?? fallbackTypeLine,
      oracleText:
        face.oracleText ?? face.oracle_text ?? face.text ?? fallbackOracleText,
      imageUrl:
        face.imageUri ??
        face.image_uris?.normal ??
        (scryfallId ? scryfallImageUrl(scryfallId, faceIndex) : undefined),
    }))
  }

  const front: CardFaceDefinition = {
    name,
    typeLine: fallbackTypeLine,
    oracleText: fallbackOracleText,
    imageUrl:
      frontImageUrl ??
      (scryfallId ? scryfallImageUrl(scryfallId, 0) : undefined),
  }
  if (!layout || !FLIPPABLE_LAYOUTS.has(layout)) return [front]

  const backImageUrl = deriveArchidektBackImageUrl(frontImageUrl)
  if (!backImageUrl) return [front]
  return [
    front,
    {
      name: `${name} — achterkant`,
      typeLine: fallbackTypeLine,
      imageUrl: backImageUrl,
    },
  ]
}

export const hasUsableCardBack = (faces: readonly CardFaceDefinition[]) =>
  faces.length === 2 && faces.every(face => Boolean(face.imageUrl))
