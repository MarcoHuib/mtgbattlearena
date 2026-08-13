import {
  archidektProvider,
  DeckProviderError,
  mapArchidektDeck,
} from "./providers/archidekt.ts"
import type { ImportedDeck } from "@mtg/game-core/types"
import { archidektTokenIds } from "@mtg/deck-source"
import {
  archidektDeckApiUrl,
  archidektTokensApiUrl,
  ArchidektHttpError,
  fetchArchidektJson,
} from "./providers/archidekt-http.ts"

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
    | "MAPPING_FAILED"
  phase: "cache_read" | "provider_fetch" | "mapping" | "cache_write"
  provider: string
  sourceId: string
  errorName?: string
  sanitizedErrorMessage?: string
  upstreamHostname?: string
  upstreamPath?: string
  upstreamStatus?: number
}

const isImportedDeck = (value: unknown): value is ImportedDeck => {
  if (!value || typeof value !== "object") return false
  const deck = value as Partial<ImportedDeck>
  return (
    typeof deck.source === "string" &&
    typeof deck.sourceId === "string" &&
    typeof deck.sourceUrl === "string" &&
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

const providerError = (error: unknown): DeckProviderError => {
  if (!(error instanceof ArchidektHttpError))
    return new DeckProviderError(
      "DECK_PROVIDER_UNAVAILABLE",
      "De deckprovider is tijdelijk niet bereikbaar.",
    )
  if (error.upstreamStatus === 404)
    return new DeckProviderError("DECK_NOT_FOUND", "Deck niet gevonden.", 404)
  if (error.upstreamStatus === 429)
    return new DeckProviderError(
      "DECK_PROVIDER_RATE_LIMITED",
      "De deckprovider beperkt tijdelijk requests.",
      429,
    )
  if (error.upstreamStatus === 413)
    return new DeckProviderError(
      "INVALID_DECK_DATA",
      "De providerresponse is te groot.",
      413,
    )
  return new DeckProviderError(
    "DECK_PROVIDER_UNAVAILABLE",
    "De deckprovider is tijdelijk niet bereikbaar.",
  )
}

export const createDeckImportService = ({
  cache,
  fetcher = fetch,
  onDiagnostic = () => undefined,
}: DeckImportServiceOptions) => ({
  async importFromUrl(inputUrl: string): Promise<DeckImportResult> {
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
      detail: Partial<DeckImportDiagnostic> = {},
    ) => {
      onDiagnostic({
        code,
        phase,
        provider: source.source,
        sourceId: source.sourceId,
        ...detail,
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
    let rawDeck: unknown
    try {
      rawDeck = (
        await fetchArchidektJson(archidektDeckApiUrl(source.sourceId), fetcher)
      ).data
    } catch (error) {
      diagnostic("PROVIDER_FETCH_FAILED", "provider_fetch", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        sanitizedErrorMessage:
          error instanceof Error ? error.message : "Unknown provider failure.",
        ...(error instanceof ArchidektHttpError
          ? {
              upstreamHostname: error.upstreamHostname,
              upstreamPath: error.upstreamPath,
              ...(error.upstreamStatus !== undefined
                ? { upstreamStatus: error.upstreamStatus }
                : {}),
            }
          : {}),
      })
      throw providerError(error)
    }
    const tokenIds = archidektTokenIds(rawDeck)
    let rawTokens: unknown
    try {
      rawTokens = tokenIds.length
        ? (await fetchArchidektJson(archidektTokensApiUrl(tokenIds), fetcher))
            .data
        : null
    } catch (error) {
      diagnostic("PROVIDER_FETCH_FAILED", "provider_fetch", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        sanitizedErrorMessage:
          error instanceof Error ? error.message : "Unknown provider failure.",
        ...(error instanceof ArchidektHttpError
          ? {
              upstreamHostname: error.upstreamHostname,
              upstreamPath: error.upstreamPath,
              ...(error.upstreamStatus !== undefined
                ? { upstreamStatus: error.upstreamStatus }
                : {}),
            }
          : {}),
      })
      throw providerError(error)
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
