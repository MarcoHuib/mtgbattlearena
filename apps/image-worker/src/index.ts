export type ImageRequest = {
  imageId: string
  faceIndex: 0 | 1
  variant: "normal"
}

export type ResolvedImage = { url: URL }
export type ImageResolver = {
  resolve(request: ImageRequest): Promise<ResolvedImage>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_BYTES = 12 * 1024 * 1024
const BROWSER_CACHE_CONTROL = "public, max-age=86400"
const EDGE_CACHE_CONTROL = "public, max-age=2592000"
const SAFE_HOST = "cards.scryfall.io"
const MAX_REDIRECTS = 3

export class ScryfallImageResolver implements ImageResolver {
  resolve(request: ImageRequest): Promise<ResolvedImage> {
    const side = request.faceIndex === 0 ? "front" : "back"
    const id = request.imageId.toLowerCase()
    return Promise.resolve({
      url: new URL(
        `https://${SAFE_HOST}/normal/${side}/${id[0]}/${id[1]}/${id}.jpg`,
      ),
    })
  }
}

type Dependencies = {
  fetch: typeof fetch
  timeoutMs?: number
  resolvers?: ReadonlyMap<number, ImageResolver>
  log?: Pick<Console, "warn" | "error">
}

const isSafeUpstream = (url: URL): boolean =>
  url.protocol === "https:" &&
  url.hostname === SAFE_HOST &&
  url.port === "" &&
  url.username === "" &&
  url.password === ""

const safeLocation = (location: string | null, base: URL) => {
  if (!location) return null
  try {
    const url = new URL(location, base)
    return { host: url.hostname, path: url.pathname }
  } catch {
    return { host: "invalid", path: "invalid" }
  }
}

const sharedHeaders = (): Headers =>
  new Headers({
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
  })

const errorResponse = (
  status: number,
  message: string,
  extra?: HeadersInit,
): Response => {
  const headers = sharedHeaders()
  headers.set("Cache-Control", "no-store")
  headers.set("Cloudflare-CDN-Cache-Control", "no-store")
  if (extra)
    new Headers(extra).forEach((value, name) => {
      headers.set(name, value)
    })
  return new Response(message, { status, headers })
}

const successHeaders = (contentType: string, etag?: string | null): Headers => {
  const headers = sharedHeaders()
  headers.set("Cache-Control", BROWSER_CACHE_CONTROL)
  headers.set("Cloudflare-CDN-Cache-Control", EDGE_CACHE_CONTROL)
  headers.set("Content-Type", contentType)
  if (etag) headers.set("ETag", etag)
  return headers
}

export const createImageHandler =
  (dependencies: Dependencies) =>
  async (request: Request): Promise<Response> => {
    if (request.method !== "GET" && request.method !== "HEAD")
      return errorResponse(405, "Method not allowed", { Allow: "GET, HEAD" })

    const url = new URL(request.url)
    if (url.search) return errorResponse(404, "Not found")
    const match = /^\/v1\/(\d+)\/([^/]+)\/(\d+)\/([^/.]+)$/.exec(
      url.pathname,
    )
    if (!match) return errorResponse(404, "Not found")

    const resolverId = Number(match[1])
    const resolver = (
      dependencies.resolvers ?? new Map([[1, new ScryfallImageResolver()]])
    ).get(resolverId)
    if (!resolver) return errorResponse(404, "Not found")

    const imageId = match[2] ?? ""
    const face = Number(match[3])
    const variant = match[4]
    if (
      !UUID.test(imageId) ||
      (face !== 0 && face !== 1) ||
      variant !== "normal"
    )
      return errorResponse(404, "Not found")

    const resolved = await resolver.resolve({
      imageId,
      faceIndex: face,
      variant,
    })
    if (!isSafeUpstream(resolved.url))
      return errorResponse(502, "Bad gateway")

    const controller = new AbortController()
    const timer = setTimeout(
      () => {
        controller.abort()
      },
      dependencies.timeoutMs ?? 8_000,
    )
    let upstreamUrl = resolved.url
    try {
      let upstream: Response | undefined
      for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
        upstream = await dependencies.fetch(upstreamUrl, {
          method: request.method,
          redirect: "manual",
          signal: controller.signal,
          headers: {
            Accept: "image/jpeg",
            "User-Agent": "MTGBattleArena-Image-CDN/1.0",
          },
        })
        if (upstream.status < 300 || upstream.status >= 400) break

        const location = upstream.headers.get("Location")
        const diagnosticLocation = safeLocation(location, upstreamUrl)
        dependencies.log?.warn("Image upstream redirect", {
          status: upstream.status,
          host: upstreamUrl.hostname,
          path: upstreamUrl.pathname,
          redirectHost: diagnosticLocation?.host ?? null,
          redirectPath: diagnosticLocation?.path ?? null,
          redirectCount,
        })
        if (!location || redirectCount === MAX_REDIRECTS)
          return errorResponse(502, "Bad gateway")
        let redirected: URL
        try {
          redirected = new URL(location, upstreamUrl)
        } catch {
          return errorResponse(502, "Bad gateway")
        }
        if (!isSafeUpstream(redirected))
          return errorResponse(502, "Bad gateway")
        upstreamUrl = redirected
      }

      if (!upstream) return errorResponse(502, "Bad gateway")
      if (!upstream.ok) {
        dependencies.log?.warn("Image upstream response rejected", {
          status: upstream.status,
          host: upstreamUrl.hostname,
          path: upstreamUrl.pathname,
        })
        return errorResponse(
          upstream.status === 404 ? 404 : 502,
          "Image unavailable",
        )
      }

      const contentType = upstream.headers
        .get("Content-Type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase()
      if (contentType !== "image/jpeg") {
        dependencies.log?.warn("Image upstream response rejected", {
          status: upstream.status,
          host: upstreamUrl.hostname,
          path: upstreamUrl.pathname,
          phase: "content-type",
        })
        return errorResponse(415, "Unsupported media type")
      }

      const declaredSize = Number(
        upstream.headers.get("Content-Length") ?? 0,
      )
      if (declaredSize > MAX_BYTES) {
        dependencies.log?.warn("Image upstream response rejected", {
          status: upstream.status,
          host: upstreamUrl.hostname,
          path: upstreamUrl.pathname,
          phase: "declared-size",
        })
        return errorResponse(413, "Payload too large")
      }

      const headers = successHeaders(
        contentType,
        upstream.headers.get("ETag"),
      )
      if (request.method === "HEAD")
        return new Response(null, { status: 200, headers })

      const body = await upstream.arrayBuffer()
      if (body.byteLength > MAX_BYTES) {
        dependencies.log?.warn("Image upstream response rejected", {
          status: upstream.status,
          host: upstreamUrl.hostname,
          path: upstreamUrl.pathname,
          phase: "actual-size",
        })
        return errorResponse(413, "Payload too large")
      }
      return new Response(body, { status: 200, headers })
    } catch (error) {
      const errorName = error instanceof Error ? error.name : "UnknownError"
      const errorMessage = error instanceof Error ? error.message : String(error)
      dependencies.log?.error("Image upstream fetch failed", {
        host: upstreamUrl.hostname,
        path: upstreamUrl.pathname,
        errorName,
        errorMessage,
      })
      const aborted = errorName === "AbortError"
      return errorResponse(
        aborted ? 504 : 502,
        aborted ? "Upstream timeout" : "Bad gateway",
      )
    } finally {
      clearTimeout(timer)
    }
  }

export default {
  fetch(request: Request): Promise<Response> {
    return createImageHandler({ fetch, log: console })(request)
  },
}
