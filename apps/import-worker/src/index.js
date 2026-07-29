const MAX_RESPONSE_BYTES = 5_000_000
const UPSTREAM_TIMEOUT_MS = 10_000

const jsonError = (status, code, message) =>
  new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  })

export default {
  async fetch(request, env, context) {
    if (request.method !== "GET") {
      return jsonError(405, "METHOD_NOT_ALLOWED", "Alleen GET is toegestaan.")
    }

    const url = new URL(request.url)
    const isTokenRequest = url.pathname === "/api/import/archidekt/tokens"
    const imageMatch =
      /^\/api\/import\/archidekt\/image\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
        url.pathname,
      )
    const imageId = imageMatch?.[1]
    const imageFace = url.searchParams.get("face")
    const imageHash = url.searchParams.get("hash")
    const isImageRequest = imageId !== undefined
    if (
      isImageRequest &&
      ((imageFace !== "front" && imageFace !== "back") ||
        !imageHash ||
        !/^\d+$/.test(imageHash))
    ) {
      return jsonError(
        400,
        "INVALID_IMAGE_REFERENCE",
        "Ongeldige afbeeldingsverwijzing.",
      )
    }
    const requestedTokenIds = (url.searchParams.get("ids") ?? "").split(",")
    const tokenIds = isTokenRequest ? [...new Set(requestedTokenIds)] : []
    if (
      isTokenRequest &&
      (tokenIds.length === 0 ||
        tokenIds.length > 100 ||
        tokenIds.some(id => !/^\d+$/.test(id)))
    ) {
      return jsonError(400, "INVALID_TOKEN_IDS", "Ongeldige token-ID's.")
    }
    const match = /^\/api\/import\/archidekt\/(\d+)$/.exec(url.pathname)
    const deckId = match?.[1]
    if (!isTokenRequest && !isImageRequest && (!deckId || deckId === "0")) {
      return jsonError(400, "INVALID_DECK_ID", "Ongeldig deck-ID.")
    }

    const cache = caches.default
    const cacheKey = new Request(url.toString(), request)
    const cached = await cache.match(cacheKey)
    if (cached) return cached

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
    try {
      const upstreamUrl = isTokenRequest
        ? `https://archidekt.com/api/cards/v2/?oracleCardIds=${encodeURIComponent(tokenIds.join(","))}&includeTokens&unique`
        : isImageRequest
          ? `https://card-images.archidekt.com/normal/${imageFace}/${imageId[0]}/${imageId[1]}/${imageId}.jpg?${imageHash}`
          : `https://archidekt.com/api/decks/${deckId}/`
      const upstream = await fetch(upstreamUrl, {
        headers: {
          Accept: isImageRequest ? "image/*" : "application/json",
          "User-Agent": "MTGBattleMode/1.0",
        },
        signal: controller.signal,
      })
      if (upstream.status === 404) {
        return jsonError(404, "NOT_FOUND", "Deck niet gevonden.")
      }
      if (upstream.status === 401 || upstream.status === 403) {
        return jsonError(403, "PRIVATE_DECK", "Deck is niet openbaar.")
      }
      if (!upstream.ok) {
        return jsonError(
          502,
          "UPSTREAM_ERROR",
          "Archidekt is tijdelijk niet bereikbaar.",
        )
      }
      const declaredSize = Number(upstream.headers.get("Content-Length") ?? 0)
      if (declaredSize > MAX_RESPONSE_BYTES) {
        return jsonError(413, "RESPONSE_TOO_LARGE", "Deckresponse is te groot.")
      }
      const payload = await upstream.arrayBuffer()
      if (payload.byteLength > MAX_RESPONSE_BYTES) {
        return jsonError(413, "RESPONSE_TOO_LARGE", "Deckresponse is te groot.")
      }
      const response = new Response(payload, {
        headers: {
          "Content-Type": isImageRequest
            ? (upstream.headers.get("Content-Type") ?? "image/jpeg")
            : "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=120, s-maxage=600",
        },
      })
      context.waitUntil(cache.put(cacheKey, response.clone()))
      return response
    } catch (error) {
      return jsonError(
        error?.name === "AbortError" ? 504 : 502,
        error?.name === "AbortError" ? "TIMEOUT" : "UPSTREAM_ERROR",
        error?.name === "AbortError"
          ? "Archidekt reageerde niet op tijd."
          : "Archidekt kon niet worden bereikt.",
      )
    } finally {
      clearTimeout(timeout)
    }
  },
}
