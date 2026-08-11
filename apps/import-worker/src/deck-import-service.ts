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
  onDiagnostic?: (diagnostic: DeckImportDiagnostic) => void
}

export type DeckImportDiagnostic = {
  code:
    | "INVALID_CACHE_ENTRY"
    | "IMPORT_CACHE_READ_FAILED"
    | "IMPORT_CACHE_WRITE_FAILED"
    | "PROVIDER_FETCH_FAILED"
    | "INVALID_PROVIDER_RESPONSE"
    | "FINGERPRINT_FAILED"
    | "MAPPING_FAILED"
  phase:
    "cache_read" | "provider_fetch" | "mapping" | "fingerprint" | "cache_write"
  provider: string
  sourceId: string
}

const isImportedDeck = (value: unknown): value is ImportedDeck => {
  if (!value || typeof value !== "object") return false
  const deck = value as Partial<ImportedDeck>
  return (
    typeof deck.source === "string" &&
    typeof deck.sourceId === "string" &&
    typeof deck.sourceUrl === "string" &&
    typeof deck.sourceHash === "string" &&
    /^[a-f0-9]{64}$/.test(deck.sourceHash) &&
    typeof deck.name === "string" &&
    typeof deck.importedAt === "string" &&
    Array.isArray(deck.cards) &&
    Array.isArray(deck.definitions)
  )
}

export const importedDeckCacheKey = (provider: string, sourceId: string) =>
  new Request(
    `https://api.mtgbattlearena.nl/__internal-cache/imported-deck/v2/${encodeURIComponent(provider)}/${encodeURIComponent(sourceId)}`,
  )

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
  onDiagnostic = () => undefined,
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
    const diagnostic = (
      code: DeckImportDiagnostic["code"],
      phase: DeckImportDiagnostic["phase"],
    ) => {
      onDiagnostic({
        code,
        phase,
        provider: source.source,
        sourceId: source.sourceId,
      })
    }
    const cacheKey = importedDeckCacheKey(source.source, source.sourceId)
    let cached: ImportedDeck | null = null
    try {
      const cachedResponse = await cache.match(cacheKey)
      if (cachedResponse) {
        const candidate: unknown = await cachedResponse.json()
        if (
          isImportedDeck(candidate) &&
          candidate.source === source.source &&
          candidate.sourceId === source.sourceId
        )
          cached = candidate
        else diagnostic("INVALID_CACHE_ENTRY", "cache_read")
      }
    } catch {
      // Cache availability must never prevent an authoritative import.
      diagnostic("IMPORT_CACHE_READ_FAILED", "cache_read")
    }
    if (cached && (!clientHash || clientHash === cached.sourceHash))
      return { cacheStatus: "HIT", deck: cached }
    let rawDeck: unknown
    try {
      rawDeck = await upstreamJson(
        `https://archidekt.com/api/decks/${source.sourceId}/`,
        fetcher,
      )
    } catch (error) {
      diagnostic("PROVIDER_FETCH_FAILED", "provider_fetch")
      throw error
    }
    const tokenIds = archidektTokenIdsForFingerprint(rawDeck)
    let rawTokens: unknown
    try {
      rawTokens = tokenIds.length
        ? await upstreamJson(
            `https://archidekt.com/api/cards/v2/?oracleCardIds=${encodeURIComponent(tokenIds.join(","))}&includeTokens&unique`,
            fetcher,
          )
        : null
    } catch (error) {
      diagnostic("PROVIDER_FETCH_FAILED", "provider_fetch")
      throw error
    }
    let deck: ImportedDeck
    try {
      deck = mapArchidektDeck(
        rawDeck,
        rawTokens,
        source,
        new Date().toISOString(),
      )
    } catch (error) {
      diagnostic(
        error instanceof DeckProviderError && error.code === "INVALID_DECK_DATA"
          ? "INVALID_PROVIDER_RESPONSE"
          : "MAPPING_FAILED",
        "mapping",
      )
      throw error
    }
    // Never persist the client hint: independently hash the fetched provider data.
    try {
      deck.sourceHash = await fingerprintArchidektSource(rawDeck, rawTokens)
    } catch (error) {
      diagnostic("FINGERPRINT_FAILED", "fingerprint")
      throw error
    }
    try {
      await cache.put(
        cacheKey,
        Response.json(deck, {
          headers: { "Cache-Control": "public, max-age=31536000" },
        }),
      )
    } catch {
      diagnostic("IMPORT_CACHE_WRITE_FAILED", "cache_write")
    }
    return { cacheStatus: cached ? "REFRESHED" : "MISS", deck }
  },
})

export { DeckProviderError }
