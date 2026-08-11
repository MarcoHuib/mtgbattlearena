type CanonicalValue =
  | null
  | string
  | number
  | boolean
  | CanonicalValue[]
  | { [key: string]: CanonicalValue }

// Provider presentation/analytics fields do not affect imported gameplay data.
const ignoredArchidektKeys = new Set([
  "views",
  "viewCount",
  "createdAt",
  "updatedAt",
  "lastViewedAt",
])

const canonicalize = (value: unknown): CanonicalValue | undefined => {
  if (Array.isArray(value)) {
    return value
      .flatMap(item => {
        const normalized = canonicalize(item)
        return normalized === undefined ? [] : [normalized]
      })
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(
          ([key, item]) => item !== undefined && !ignoredArchidektKeys.has(key),
        )
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([key, item]) => {
          const normalized = canonicalize(item)
          return normalized === undefined ? [] : [[key, normalized] as const]
        }),
    )
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value
  return undefined
}

const hex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)]
    .map(value => value.toString(16).padStart(2, "0"))
    .join("")

/** Fingerprints provider source only; it deliberately performs no deck mapping. */
export const fingerprintArchidektSource = async (
  deckResponse: unknown,
  tokenResponse: unknown = null,
): Promise<string> =>
  hex(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        JSON.stringify(canonicalize({ deckResponse, tokenResponse })),
      ),
    ),
  )

export const archidektTokenIdsForFingerprint = (value: unknown): string[] => {
  if (!value || typeof value !== "object") return []
  const cards = (value as { cards?: unknown }).cards
  if (!Array.isArray(cards)) return []
  const ids = new Set<string>()
  for (const item of cards) {
    if (!item || typeof item !== "object") continue
    const card = (item as { card?: unknown }).card
    if (!card || typeof card !== "object") continue
    const oracle = (card as { oracleCard?: unknown }).oracleCard
    if (!oracle || typeof oracle !== "object") continue
    const tokens = (oracle as { tokens?: unknown }).tokens
    if (!Array.isArray(tokens)) continue
    for (const id of tokens)
      if (typeof id === "string" || typeof id === "number") ids.add(String(id))
  }
  return [...ids].sort()
}

export const parseArchidektSourceId = (input: string): string => {
  const url = new URL(input.trim())
  if (
    url.protocol !== "https:" ||
    !new Set(["archidekt.com", "www.archidekt.com"]).has(
      url.hostname.toLowerCase(),
    ) ||
    url.port ||
    url.username ||
    url.password
  )
    throw new Error("INVALID_DECK_URL")
  const id = /^\/decks\/(\d+)(?:\/[^/?#]+)?\/?$/.exec(url.pathname)?.[1]
  if (!id || id === "0") throw new Error("INVALID_DECK_URL")
  return id
}
