import { z } from "zod"
import type {
  CardDefinition,
  DeckCard,
  ImportedDeck,
  ManaColor,
  TokenKind,
} from "@mtg/game-core/types"

const id = z.union([z.string(), z.number()])
const face = z
  .object({
    name: z.string().nullish(),
    displayName: z.string().nullish(),
    typeLine: z.string().optional(),
    type_line: z.string().optional(),
    oracleText: z.string().optional(),
    oracle_text: z.string().optional(),
    text: z.string().optional(),
    imageUri: z.url().nullish(),
    image_uris: z.object({ normal: z.url().nullish() }).loose().optional(),
  })
  .loose()
const oracle = z
  .object({
    id: id.optional(),
    oracleId: id.optional(),
    uid: id.optional(),
    name: z.string().nullish(),
    text: z.string().optional(),
    typeLine: z.string().optional(),
    types: z.array(z.string()).optional(),
    subTypes: z.array(z.string()).optional(),
    superTypes: z.array(z.string()).optional(),
    layout: z.string().optional(),
    cmc: z.number().nonnegative().optional(),
    manaValue: z.number().nonnegative().optional(),
    colorIdentity: z.array(z.string()).optional(),
    power: z.string().nullish(),
    toughness: z.string().nullish(),
    keywords: z.array(z.string()).optional(),
    tokens: z.array(id).optional(),
    cardFaces: z.array(face).optional(),
    faces: z.array(face).optional(),
  })
  .loose()
const externalCard = z
  .object({
    id: id.optional(),
    uid: id.optional(),
    name: z.string().nullish(),
    displayName: z.string().nullish(),
    scryfallImageHash: id.nullish(),
    oracleCard: oracle.optional(),
    imageUri: z.url().nullish(),
    image_uris: z.object({ normal: z.url().nullish() }).loose().nullish(),
    card_faces: z.array(face).optional(),
    cmc: z.number().nonnegative().optional(),
    manaValue: z.number().nonnegative().optional(),
  })
  .loose()
const category = z.union([z.string(), z.object({ name: z.string() }).loose()])
export const archidektDeckSchema = z
  .object({
    id: id.optional(),
    name: z.string().min(1),
    format: z.string().optional(),
    cards: z.array(
      z
        .object({
          quantity: z.number().int().positive(),
          card: externalCard,
          categories: z.array(category).default([]),
        })
        .loose(),
    ),
  })
  .loose()
export const archidektTokensSchema = z
  .object({ results: z.array(externalCard) })
  .loose()

const hosts = new Set(["archidekt.com", "www.archidekt.com"])
export type ParsedDeckSource = Pick<
  ImportedDeck,
  "source" | "sourceId" | "sourceUrl"
>
export const parseArchidektUrl = (input: string): ParsedDeckSource => {
  let url
  try {
    url = new URL(input.trim())
  } catch {
    throw new DeckProviderError(
      "INVALID_DECK_URL",
      "Vul een geldige deck-URL in.",
      400,
    )
  }
  if (
    url.protocol !== "https:" ||
    !hosts.has(url.hostname.toLowerCase()) ||
    url.port ||
    url.username ||
    url.password
  ) {
    throw new DeckProviderError(
      "INVALID_DECK_URL",
      "Alleen veilige Archidekt deck-URL's worden ondersteund.",
      400,
    )
  }
  const sourceId = /^\/decks\/(\d+)(?:\/[^/?#]+)?\/?$/.exec(url.pathname)?.[1]
  if (!sourceId || sourceId === "0")
    throw new DeckProviderError(
      "INVALID_DECK_URL",
      "De URL bevat geen geldig deck-ID.",
      400,
    )
  return {
    source: "archidekt" as const,
    sourceId,
    sourceUrl: `https://archidekt.com/decks/${sourceId}`,
  }
}

export class DeckProviderError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 502) {
    super(message)
    this.code = code
    this.status = status
  }
}

type Category = z.infer<typeof category>
type ExternalCard = z.infer<typeof externalCard>
type DeckResponse = z.infer<typeof archidektDeckSchema>
type DeckItem = DeckResponse["cards"][number]
type TypeLineInput = {
  typeLine?: string
  superTypes?: string[]
  types?: string[]
  subTypes?: string[]
}
const valueId = (value: string | number | undefined): string | undefined =>
  value === undefined ? undefined : String(value)
const categoryName = (value: Category): string =>
  typeof value === "string" ? value : value.name
const typeLine = (value: TypeLineInput): string | undefined => {
  if (value.typeLine) return value.typeLine
  const constructed = (
    [...(value.superTypes ?? []), ...(value.types ?? [])].join(" ") +
    ((value.subTypes?.length ?? 0)
      ? ` — ${(value.subTypes ?? []).join(" ")}`
      : "")
  ).trim()
  return constructed.length ? constructed : undefined
}
const numberStat = (value: string | null | undefined): number | undefined =>
  value && /^-?\d+$/.test(value) ? Number(value) : undefined
const manaColors = new Set<ManaColor>(["W", "U", "B", "R", "G"])
const archidektColorNames: Record<string, ManaColor> = {
  white: "W",
  blue: "U",
  black: "B",
  red: "R",
  green: "G",
}
const isManaColor = (value: string): value is ManaColor =>
  manaColors.has(value as ManaColor)
const colorIdentity = (values: string[] | undefined): ManaColor[] => [
  ...new Set(
    (values ?? []).flatMap(value => {
      const normalized = value.trim()
      if (isManaColor(normalized)) return [normalized]
      const mapped = archidektColorNames[normalized.toLowerCase()]
      return mapped ? [mapped] : []
    }),
  ),
]
const tokenKind = (name: string, types: readonly string[]): TokenKind => {
  const key = name.toLowerCase()
  if (key === "treasure" || key === "food" || key === "clue" || key === "copy")
    return key
  if (types.some(value => value.toLowerCase() === "emblem")) return "emblem"
  if (types.some(value => value.toLowerCase() === "creature")) return "creature"
  return "other"
}
const foretellDefinition: CardDefinition = {
  id: "207b3d62-2541-4a51-8152-3c54218ab6f7",
  name: "Foretell",
  layout: "token",
  faces: [
    {
      name: "Foretell",
      typeLine: "Card",
      oracleText:
        "Place foretold cards here. You may cast them later for their foretell cost.",
    },
  ],
  imageRefs: [],
  typeLine: "Card",
  token: { kind: "other", name: "Foretell", source: "deck" as const },
}
const toDefinition = (
  raw: DeckItem | ExternalCard,
  token = false,
): CardDefinition => {
  const card: ExternalCard = "quantity" in raw ? (raw as DeckItem).card : raw
  const oracleCard = card.oracleCard ?? {}
  const name = card.name ?? card.displayName ?? oracleCard.name
  if (!name)
    throw new DeckProviderError(
      "INVALID_DECK_DATA",
      "Een kaart heeft geen leesbare naam.",
    )
  const definitionId =
    valueId(card.uid) ??
    valueId(card.id) ??
    valueId(oracleCard.uid) ??
    valueId(oracleCard.oracleId) ??
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  const scryfallId = valueId(card.uid)
  const uuid =
    scryfallId && /^[0-9a-f-]{36}$/i.test(scryfallId) ? scryfallId : undefined
  const explicit = card.card_faces ?? oracleCard.cardFaces ?? oracleCard.faces
  const faces = explicit?.length
    ? explicit.map((item, index) => ({
        name:
          item.name ??
          item.displayName ??
          (index ? `${name} — achterkant` : name),
        typeLine:
          item.typeLine ??
          item.type_line ??
          typeLine(item) ??
          typeLine(oracleCard),
        oracleText:
          item.oracleText ?? item.oracle_text ?? item.text ?? oracleCard.text,
      }))
    : [
        {
          name,
          typeLine: typeLine(oracleCard),
          oracleText: oracleCard.text,
        },
      ]
  if (
    !explicit?.length &&
    [
      "transform",
      "modal_dfc",
      "double_faced_token",
      "reversible_card",
    ].includes(oracleCard.layout ?? "") &&
    uuid &&
    card.scryfallImageHash != null
  ) {
    faces.push({
      name: `${name} — achterkant`,
      typeLine: typeLine(oracleCard),
      oracleText: undefined,
    })
  }
  const types = oracleCard.types ?? []
  const isToken =
    token ||
    oracleCard.layout === "token" ||
    types.some(value => value.toLowerCase() === "token")
  return {
    id: definitionId,
    name,
    ...((valueId(oracleCard.uid) ??
    valueId(oracleCard.oracleId) ??
    valueId(oracleCard.id))
      ? {
          oracleId:
            valueId(oracleCard.uid) ??
            valueId(oracleCard.oracleId) ??
            valueId(oracleCard.id),
        }
      : {}),
    ...(oracleCard.layout ? { layout: oracleCard.layout } : {}),
    faces,
    imageRefs: uuid
      ? faces.map((_item, faceIndex) => ({
          resolver: 1,
          imageId: uuid,
          faceIndex,
          variant: "normal" as const,
        }))
      : [],
    ...(oracleCard.text ? { oracleText: oracleCard.text } : {}),
    ...(typeLine(oracleCard) ? { typeLine: typeLine(oracleCard) } : {}),
    ...((card.manaValue ??
      card.cmc ??
      oracleCard.manaValue ??
      oracleCard.cmc) != null
      ? {
          manaValue:
            card.manaValue ??
            card.cmc ??
            oracleCard.manaValue ??
            oracleCard.cmc,
        }
      : {}),
    ...(colorIdentity(oracleCard.colorIdentity).length
      ? { colorIdentity: colorIdentity(oracleCard.colorIdentity) }
      : {}),
    ...(isToken
      ? {
          token: {
            kind: tokenKind(name, types),
            name,
            ...(numberStat(oracleCard.power) != null
              ? { power: numberStat(oracleCard.power) }
              : {}),
            ...(numberStat(oracleCard.toughness) != null
              ? { toughness: numberStat(oracleCard.toughness) }
              : {}),
            source: "deck" as const,
          },
        }
      : {}),
  }
}

export const mapArchidektDeck = (
  deckRaw: unknown,
  tokenRaw: unknown,
  source: ParsedDeckSource,
  importedAt: string,
): ImportedDeck => {
  const parsed = archidektDeckSchema.safeParse(deckRaw)
  if (!parsed.success)
    throw new DeckProviderError(
      "INVALID_DECK_DATA",
      "Archidekt gaf ongeldige deckdata terug.",
    )
  const definitions = new Map<string, CardDefinition>()
  const cards = new Map<string, DeckCard>()
  for (const item of parsed.data.cards) {
    const definition = toDefinition(item)
    definitions.set(definition.id, definition)
    const isCommander = item.categories.some(item =>
      ["commander", "commanders"].includes(
        categoryName(item).trim().toLowerCase(),
      ),
    )
    const key = `${definition.id}:${isCommander}`
    const previous = cards.get(key)
    cards.set(key, {
      definitionId: definition.id,
      quantity: (previous?.quantity ?? 0) + item.quantity,
      isCommander,
    })
  }
  if (
    parsed.data.cards.some(item =>
      (item.card.oracleCard?.keywords ?? []).some(
        keyword => keyword.trim().toLowerCase() === "foretell",
      ),
    )
  ) {
    definitions.set(foretellDefinition.id, structuredClone(foretellDefinition))
  }
  if (!cards.size)
    throw new DeckProviderError(
      "INVALID_DECK_DATA",
      "Het deck bevat geen importeerbare kaarten.",
    )
  if (tokenRaw) {
    const tokens = archidektTokensSchema.safeParse(tokenRaw)
    if (!tokens.success)
      throw new DeckProviderError(
        "INVALID_DECK_DATA",
        "Archidekt gaf ongeldige tokendata terug.",
      )
    for (const token of tokens.data.results) {
      const definition = toDefinition(token, true)
      definitions.set(definition.id, definition)
    }
  }
  return {
    ...source,
    name: parsed.data.name,
    ...(parsed.data.format ? { format: parsed.data.format } : {}),
    importedAt,
    cards: [...cards.values()],
    definitions: [...definitions.values()],
  }
}

export const archidektTokenIds = (raw: unknown): string[] => {
  const parsed = archidektDeckSchema.parse(raw)
  return [
    ...new Set(
      parsed.cards.flatMap(item =>
        (item.card.oracleCard?.tokens ?? []).map(String),
      ),
    ),
  ].sort()
}

export const archidektProvider = {
  source: "archidekt",
  recognizesHost(hostname: string): boolean {
    return hosts.has(hostname.toLowerCase())
  },
  supports(input: string): boolean {
    try {
      parseArchidektUrl(input)
      return true
    } catch {
      return false
    }
  },
  parseUrl: parseArchidektUrl,
}
