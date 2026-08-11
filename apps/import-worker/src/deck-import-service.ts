import {
  archidektProvider,
  DeckProviderError,
  mapArchidektDeck,
} from "./providers/archidekt.ts"
import type { ImportedDeck } from "@mtg/game-core/types"
import {
  archidektTokenIdsForFingerprint,
  fingerprintArchidektSource,
} from "@mtg/deck-source"

type DeckCacheStatus = "HIT" | "MISS" | "REFRESHED"
export type DeckImportResult = {
  cacheStatus: DeckCacheStatus
  deck: ImportedDeck
}
export type DeckImportCache = {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}
export type DeckImportServiceOptions = {
  cache: DeckImportCache
  fetcher?: typeof fetch
}

const providers = [archidektProvider]
const upstreamJson = async (
  url: string,
  fetcher: typeof fetch,
): Promise<unknown> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, 10_000)
  try {
    const response = await fetcher(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "MTGBattleMode/1.0",
      },
      redirect: "error",
      signal: controller.signal,
    })
    if (response.status === 404)
      throw new DeckProviderError("DECK_NOT_FOUND", "Deck niet gevonden.", 404)
    if (response.status === 429)
      throw new DeckProviderError(
        "DECK_PROVIDER_RATE_LIMITED",
        "De deckprovider beperkt tijdelijk requests.",
        429,
      )
    if (!response.ok)
      throw new DeckProviderError(
        "DECK_PROVIDER_UNAVAILABLE",
        "De deckprovider is tijdelijk niet bereikbaar.",
      )
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > 5_000_000)
      throw new DeckProviderError(
        "INVALID_DECK_DATA",
        "De providerresponse is te groot.",
        413,
      )
    try {
      return JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      throw new DeckProviderError(
        "INVALID_DECK_DATA",
        "De providerresponse bevat geen geldige JSON.",
      )
    }
  } finally {
    clearTimeout(timeout)
  }
}

export const createDeckImportService = ({
  cache,
  fetcher = fetch,
}: DeckImportServiceOptions) => ({
  async importFromUrl(
    inputUrl: string,
    clientHash?: string,
  ): Promise<DeckImportResult> {
    let parsedUrl
    try {
      parsedUrl = new URL(inputUrl.trim())
    } catch {
      throw new DeckProviderError(
        "INVALID_DECK_URL",
        "Vul een geldige deck-URL in.",
        400,
      )
    }
    const provider = providers.find(candidate =>
      candidate.recognizesHost(parsedUrl.hostname),
    )
    if (!provider)
      throw new DeckProviderError(
        "UNSUPPORTED_DECK_PROVIDER",
        "Deze deckprovider wordt niet ondersteund.",
        400,
      )
    const source = provider.parseUrl(inputUrl)
    const cacheKey = new Request(
      `https://cache.internal/imported-decks/${source.source}/${source.sourceId}`,
    )
    const cachedResponse = await cache.match(cacheKey)
    const cached = cachedResponse
      ? ((await cachedResponse.json()) as ImportedDeck)
      : null
    if (cached && (!clientHash || clientHash === cached.sourceHash))
      return { cacheStatus: "HIT", deck: cached }
    const rawDeck = await upstreamJson(
      `https://archidekt.com/api/decks/${source.sourceId}/`,
      fetcher,
    )
    const tokenIds = archidektTokenIdsForFingerprint(rawDeck)
    const rawTokens = tokenIds.length
      ? await upstreamJson(
          `https://archidekt.com/api/cards/v2/?oracleCardIds=${encodeURIComponent(tokenIds.join(","))}&includeTokens&unique`,
          fetcher,
        )
      : null
    const deck = mapArchidektDeck(
      rawDeck,
      rawTokens,
      source,
      new Date().toISOString(),
    )
    // Never persist the client hint: independently hash the fetched provider data.
    deck.sourceHash = await fingerprintArchidektSource(rawDeck, rawTokens)
    await cache.put(
      cacheKey,
      Response.json(deck, {
        headers: { "Cache-Control": "public, max-age=31536000" },
      }),
    )
    return { cacheStatus: cached ? "REFRESHED" : "MISS", deck }
  },
})

export { DeckProviderError }
