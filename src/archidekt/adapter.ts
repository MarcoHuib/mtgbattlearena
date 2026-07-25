import type {
  CardDefinition,
  CardFaceDefinition,
  CardImageRef,
  DeckCard,
  ImportedDeck,
} from "../game-core/types"
import { DeckImportError } from "./errors"
import { archidektDeckSchema, type ArchidektDeckResponse } from "./schema"

const valueId = (value: string | number | undefined) =>
  value === undefined ? undefined : String(value)

const categoryName = (value: string | { name: string }): string =>
  typeof value === "string" ? value : value.name

const typeLineFromParts = (value: {
  typeLine?: string
  superTypes?: string[]
  types?: string[]
  subTypes?: string[]
}): string | undefined => {
  if (value.typeLine) return value.typeLine
  const mainTypes = [...(value.superTypes ?? []), ...(value.types ?? [])].join(
    " ",
  )
  const subTypes = value.subTypes?.join(" ")
  if (!mainTypes) return undefined
  return subTypes ? `${mainTypes} — ${subTypes}` : mainTypes
}

const scryfallImageUrl = (scryfallId: string, faceIndex?: number): string => {
  const face = faceIndex === undefined || faceIndex === 0 ? "front" : "back"
  return `https://cards.scryfall.io/normal/${face}/${scryfallId[0]}/${scryfallId[1]}/${encodeURIComponent(scryfallId)}.jpg`
}

const toDefinition = (
  item: ArchidektDeckResponse["cards"][number],
): CardDefinition => {
  const raw = item.card
  const oracle = raw.oracleCard
  const name = raw.name ?? raw.displayName ?? oracle?.name
  if (!name) {
    throw new DeckImportError(
      "INVALID_RESPONSE",
      "Een kaart in dit deck heeft geen leesbare naam.",
      "cards[].card.name/displayName/oracleCard.name ontbreekt",
    )
  }
  const id =
    valueId(raw.uid) ??
    valueId(raw.id) ??
    valueId(oracle?.uid) ??
    valueId(oracle?.oracleId) ??
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  const scryfallId = valueId(raw.uid)
  const imageId =
    scryfallId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      scryfallId,
    )
      ? scryfallId
      : undefined
  const rawFaces = raw.card_faces ?? oracle?.cardFaces ?? oracle?.faces
  const faces: CardFaceDefinition[] =
    rawFaces && rawFaces.length > 0
      ? rawFaces.map((face, faceIndex) => ({
          name: face.name ?? face.displayName ?? name,
          typeLine:
            face.typeLine ??
            face.type_line ??
            typeLineFromParts(face) ??
            typeLineFromParts(oracle ?? {}),
          oracleText: face.oracleText ?? face.oracle_text ?? face.text,
          imageUrl:
            face.imageUri ??
            face.image_uris?.normal ??
            (imageId ? scryfallImageUrl(imageId, faceIndex) : undefined),
        }))
      : [
          {
            name,
            typeLine: typeLineFromParts(oracle ?? {}),
            oracleText: oracle?.text,
            imageUrl:
              raw.imageUri ??
              raw.image_uris?.normal ??
              (imageId ? scryfallImageUrl(imageId) : undefined),
          },
        ]
  const imageRefs: CardImageRef[] = faces.flatMap((face, faceIndex) =>
    face.imageUrl
      ? [
          {
            assetKey: `${scryfallId ?? id}:${faceIndex}:normal`,
            faceIndex,
            variant: "normal" as const,
            url: face.imageUrl,
          },
        ]
      : [],
  )

  return {
    id,
    name,
    scryfallId,
    oracleId:
      valueId(oracle?.uid) ?? valueId(oracle?.oracleId) ?? valueId(oracle?.id),
    layout: oracle?.layout,
    faces,
    imageRefs,
    oracleText: oracle?.text,
    typeLine: typeLineFromParts(oracle ?? {}),
  }
}

export const normalizeArchidektDeck = (
  rawValue: unknown,
  deckId: string,
  importedAt = new Date().toISOString(),
): ImportedDeck => {
  const result = archidektDeckSchema.safeParse(rawValue)
  if (!result.success) {
    const details = result.error.issues
      .slice(0, 5)
      .map(issue => `${issue.path.join(".") || "response"}: ${issue.message}`)
      .join("; ")
    throw new DeckImportError(
      "INVALID_RESPONSE",
      "Archidekt gaf deckdata terug die niet veilig kon worden gelezen.",
      details,
    )
  }

  const definitions = new Map<string, CardDefinition>()
  const entries = new Map<string, DeckCard>()
  for (const item of result.data.cards) {
    const definition = toDefinition(item)
    definitions.set(definition.id, definition)
    const isCommander = item.categories.some(category =>
      ["commander", "commanders"].includes(
        categoryName(category).trim().toLowerCase(),
      ),
    )
    const entryKey = `${definition.id}:${isCommander ? "commander" : "main"}`
    const current = entries.get(entryKey)
    entries.set(entryKey, {
      definitionId: definition.id,
      quantity: (current?.quantity ?? 0) + item.quantity,
      isCommander,
    })
  }

  if (entries.size === 0) {
    throw new DeckImportError(
      "INVALID_RESPONSE",
      "Dit deck bevat geen importeerbare kaarten.",
    )
  }

  return {
    source: "archidekt",
    sourceDeckId: deckId,
    name: result.data.name,
    importedAt,
    cards: [...entries.values()],
    definitions: [...definitions.values()],
  }
}
