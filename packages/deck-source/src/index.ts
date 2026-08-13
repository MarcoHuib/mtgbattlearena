export const archidektTokenIds = (value: unknown): string[] => {
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
