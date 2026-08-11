/* eslint-disable @typescript-eslint/consistent-type-definitions, @typescript-eslint/require-await, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-confusing-void-expression */
export type ImageRequest = {
  imageId: string
  faceIndex: 0 | 1
  variant: "normal"
}

export type ResolvedImage = { url: URL }
export interface ImageResolver {
  resolve(request: ImageRequest): Promise<ResolvedImage>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_BYTES = 12 * 1024 * 1024
const CACHE_CONTROL = "public, max-age=31536000, immutable"
const SAFE_HOST = "cards.scryfall.io"

export class ScryfallImageResolver implements ImageResolver {
  async resolve(request: ImageRequest): Promise<ResolvedImage> {
    const side = request.faceIndex === 0 ? "front" : "back"
    const id = request.imageId.toLowerCase()
    return { url: new URL(`https://${SAFE_HOST}/normal/${side}/${id[0]}/${id[1]}/${id}.jpg`) }
  }
}

type Dependencies = {
  fetch: typeof fetch
  cache?: Pick<Cache, "match" | "put">
  timeoutMs?: number
  resolvers?: ReadonlyMap<number, ImageResolver>
}

const responseHeaders = (contentType: string, etag?: string | null) => {
  const headers = new Headers({
    "Cache-Control": CACHE_CONTROL,
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "X-Content-Type-Options": "nosniff",
  })
  if (etag) headers.set("ETag", etag)
  return headers
}

export const createImageHandler = (dependencies: Dependencies) => async (request: Request): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } })
  const url = new URL(request.url)
  if (url.search) return new Response("Not found", { status: 404 })
  const match = /^\/v1\/(\d+)\/([^/]+)\/(\d+)\/([^/.]+)\.webp$/.exec(url.pathname)
  if (!match) return new Response("Not found", { status: 404 })
  const resolverId = Number(match[1])
  const resolver = (dependencies.resolvers ?? new Map([[1, new ScryfallImageResolver()]])).get(resolverId)
  if (!resolver) return new Response("Not found", { status: 404 })
  const imageId = match[2]!
  const face = Number(match[3])
  const variant = match[4]
  if (!UUID.test(imageId) || (face !== 0 && face !== 1) || variant !== "normal") return new Response("Not found", { status: 404 })

  const cacheKey = new Request(url.toString(), { method: "GET" })
  if (dependencies.cache) {
    try {
      const hit = await dependencies.cache.match(cacheKey)
      if (hit) return request.method === "HEAD" ? new Response(null, { status: hit.status, headers: hit.headers }) : hit
    } catch { /* cache availability must not affect delivery */ }
  }

  const resolved = await resolver.resolve({ imageId, faceIndex: face, variant })
  if (resolved.url.protocol !== "https:" || resolved.url.hostname !== SAFE_HOST) return new Response("Bad gateway", { status: 502 })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? 8_000)
  try {
    const upstream = await dependencies.fetch(resolved.url, { method: request.method, redirect: "manual", signal: controller.signal })
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("Location")
      if (!location || new URL(location, resolved.url).hostname !== SAFE_HOST) return new Response("Bad gateway", { status: 502 })
      return new Response("Bad gateway", { status: 502 })
    }
    if (!upstream.ok) return new Response("Image unavailable", { status: upstream.status === 404 ? 404 : 502 })
    const contentType = upstream.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase()
    if (!contentType?.startsWith("image/")) return new Response("Bad gateway", { status: 502 })
    const declaredSize = Number(upstream.headers.get("Content-Length") ?? 0)
    if (declaredSize > MAX_BYTES) return new Response("Payload too large", { status: 502 })
    if (request.method === "HEAD") return new Response(null, { status: 200, headers: responseHeaders(contentType, upstream.headers.get("ETag")) })
    const body = await upstream.arrayBuffer()
    if (body.byteLength > MAX_BYTES) return new Response("Payload too large", { status: 502 })
    const safe = new Response(body, { status: 200, headers: responseHeaders(contentType, upstream.headers.get("ETag")) })
    if (dependencies.cache) {
      try { await dependencies.cache.put(cacheKey, safe.clone()) } catch { /* non-fatal */ }
    }
    return safe
  } catch (error) {
    return new Response(error instanceof DOMException && error.name === "AbortError" ? "Upstream timeout" : "Bad gateway", { status: 504 })
  } finally {
    clearTimeout(timer)
  }
}

export default {
  fetch(request: Request): Promise<Response> {
    const cache = typeof caches === "undefined" ? undefined : (caches as CacheStorage & { default: Cache }).default
    return createImageHandler({ fetch, ...(cache ? { cache } : {}) })(request)
  },
}
