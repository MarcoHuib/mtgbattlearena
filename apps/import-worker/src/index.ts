const UPSTREAM_TIMEOUT_MS = 10_000

const corsHeadersFor = (request: Request, env: Env): Record<string, string> => {
  const origin = request.headers.get("Origin")
  const allowedOrigins = (env.ALLOWED_ORIGIN ?? "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
  if (!origin || !allowedOrigins.includes(origin)) return {}
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  }
}

const withCors = (
  response: Response,
  corsHeaders: Record<string, string>,
): Response => {
  const headers = new Headers(response.headers)
  Object.entries(corsHeaders).forEach(([name, value]) => {
    headers.set(name, value)
  })
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const jsonError = (
  status: number,
  code: string,
  message: string,
  corsHeaders: Record<string, string> = {},
): Response =>
  new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  })

export default {
  async fetch(request: Request, env: Env, context: WorkerContext) {
    const corsHeaders = corsHeadersFor(request, env)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders,
          "Access-Control-Allow-Headers": "Accept",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Max-Age": "86400",
        },
      })
    }
    const url = new URL(request.url)
    if (request.method === "POST" && url.pathname === "/internal/deck-import") {
      try {
        const declaredSize = Number(request.headers.get("Content-Length") ?? 0)
        if (declaredSize > 16_384)
          return jsonError(
            413,
            "REQUEST_TOO_LARGE",
            "De importrequest is te groot.",
            corsHeaders,
          )
        const body = (await request.json()) as ImportRequestBody
        if (
          !body ||
          typeof body.url !== "string" ||
          (body.sourceHash !== undefined && typeof body.sourceHash !== "string")
        ) {
          return jsonError(
            400,
            "INVALID_DECK_URL",
            "De importrequest is ongeldig.",
            corsHeaders,
          )
        }
        const result = await createDeckImportService({
          cache: (caches as CloudflareCacheStorage).default,
          onDiagnostic: diagnostic => {
            console.error("Deck import diagnostic.", {
              event: "deck_import_diagnostic",
              ...diagnostic,
              releaseVersion: env.RELEASE_VERSION ?? "unknown",
            })
          },
        }).importFromUrl(body.url, body.sourceHash)
        return new Response(JSON.stringify(result), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...corsHeaders,
          },
        })
      } catch (error) {
        const sourceId =
          typeof (error as { sourceId?: unknown })?.sourceId === "string"
            ? (error as { sourceId: string }).sourceId
            : undefined
        console.error("Deck import failed.", {
          event: "deck_import_failed",
          code:
            error instanceof DeckProviderError
              ? error.code
              : "DECK_IMPORT_FAILED",
          provider: "archidekt",
          ...(sourceId ? { sourceId } : {}),
          releaseVersion: env.RELEASE_VERSION ?? "unknown",
        })
        if (error instanceof DeckProviderError)
          return jsonError(error.status, error.code, error.message, corsHeaders)
        return jsonError(
          502,
          "DECK_IMPORT_FAILED",
          "Het deck kon niet veilig worden geïmporteerd.",
          corsHeaders,
        )
      }
    }
    if (request.method !== "GET") {
      const response = jsonError(
        405,
        "METHOD_NOT_ALLOWED",
        "Alleen GET is toegestaan.",
        corsHeaders,
      )
      response.headers.set("Allow", "GET, OPTIONS")
      return response
    }

    const isTokenRequest = url.pathname === "/api/import/archidekt/tokens"
    const requestedTokenIds = (url.searchParams.get("ids") ?? "").split(",")
    const tokenIds = isTokenRequest ? [...new Set(requestedTokenIds)] : []
    if (
      isTokenRequest &&
      (tokenIds.length === 0 ||
        tokenIds.length > 100 ||
        tokenIds.some(id => !/^\d+$/.test(id)))
    ) {
      return jsonError(
        400,
        "INVALID_TOKEN_IDS",
        "Ongeldige token-ID's.",
        corsHeaders,
      )
    }
    const match = /^\/api\/import\/archidekt\/(\d+)$/.exec(url.pathname)
    const deckId = match?.[1]
    if (!isTokenRequest && (!deckId || deckId === "0")) {
      return jsonError(400, "INVALID_DECK_ID", "Ongeldig deck-ID.", corsHeaders)
    }

    const cache = (caches as CloudflareCacheStorage).default
    const cacheKey = new Request(url.toString(), request)
    const freshnessProbe =
      url.searchParams.get("fresh") === "1"
    const cached = freshnessProbe ? undefined : await cache.match(cacheKey)
    if (cached) return withCors(cached, corsHeaders)

    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
    }, UPSTREAM_TIMEOUT_MS)
    try {
      const upstreamUrl = isTokenRequest
        ? archidektTokensApiUrl(tokenIds)
        : archidektDeckApiUrl(deckId ?? "")
      {
        const upstream = await fetchArchidektJson(upstreamUrl)
        const response = new Response(upstream.payload, {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": freshnessProbe
              ? "no-store"
              : "public, max-age=120, s-maxage=600",
          },
        })
        if (!freshnessProbe)
          context.waitUntil(cache.put(cacheKey, response.clone()))
        return withCors(response, corsHeaders)
      }
    } catch (error: unknown) {
      if (error instanceof ArchidektHttpError) {
        const status = error.upstreamStatus
        if (status === 404)
          return jsonError(404, "NOT_FOUND", "Deck niet gevonden.", corsHeaders)
        if (status === 401 || status === 403)
          return jsonError(
            403,
            "PRIVATE_DECK",
            "Deck is niet openbaar.",
            corsHeaders,
          )
        if (status === 413)
          return jsonError(
            413,
            "RESPONSE_TOO_LARGE",
            "Deckresponse is te groot.",
            corsHeaders,
          )
        return jsonError(
          error.message.includes("timed out") ? 504 : 502,
          error.message.includes("timed out") ? "TIMEOUT" : "UPSTREAM_ERROR",
          error.message.includes("timed out")
            ? "Archidekt reageerde niet op tijd."
            : "Archidekt kon niet worden bereikt.",
          corsHeaders,
        )
      }
      const aborted =
        error instanceof DOMException && error.name === "AbortError"
      return jsonError(
        aborted ? 504 : 502,
        aborted ? "TIMEOUT" : "UPSTREAM_ERROR",
        aborted
          ? "Archidekt reageerde niet op tijd."
          : "Archidekt kon niet worden bereikt.",
        corsHeaders,
      )
    } finally {
      clearTimeout(timeout)
    }
  },
}
import {
  createDeckImportService,
  DeckProviderError,
} from "./deck-import-service.ts"
import {
  archidektDeckApiUrl,
  archidektTokensApiUrl,
  ArchidektHttpError,
  fetchArchidektJson,
} from "./providers/archidekt-http.ts"

type Env = { ALLOWED_ORIGIN?: string; RELEASE_VERSION?: string }
type WorkerContext = { waitUntil(promise: Promise<unknown>): void }
type CloudflareCacheStorage = CacheStorage & { default: Cache }
type ImportRequestBody = { url?: unknown; sourceHash?: unknown }
