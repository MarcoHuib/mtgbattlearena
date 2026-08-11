/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/require-await, @typescript-eslint/no-base-to-string, @typescript-eslint/no-confusing-void-expression */
import { describe, expect, it, vi } from "vitest"
import { createImageHandler, type ImageResolver } from "../src/index"

const id = "6a9c39e4-a8cf-42dd-8d0e-45634b335546"
const request = (path = `/v1/1/${id}/0/normal.webp`, method = "GET") =>
  new Request(`https://cdn.mtgbattlearena.nl${path}`, { method })
const jpeg = () => new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } })

describe("image CDN boundary", () => {
  it("accepts resolver 1 and emits a public immutable image", async () => {
    const fetch = vi.fn(async (_input: URL | RequestInfo) => jpeg())
    const response = await createImageHandler({ fetch })(request())
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("image/jpeg")
    expect(response.headers.get("Cache-Control")).toContain("immutable")
    expect(fetch.mock.calls[0]?.[0].toString()).toContain(`cards.scryfall.io/normal/front/6/a/${id}.jpg`)
  })

  it.each([
    ["unknown resolver", `/v1/2/${id}/0/normal.webp`],
    ["malformed id", "/v1/1/https:%2F%2Fevil.test/x/0/normal.webp"],
    ["unsupported variant", `/v1/1/${id}/0/large.webp`],
    ["unsupported face", `/v1/1/${id}/2/normal.webp`],
    ["query input", `/v1/1/${id}/0/normal.webp?url=https://evil.test`],
  ])("rejects %s", async (_name, path) => {
    expect((await createImageHandler({ fetch: vi.fn() })(request(path))).status).toBe(404)
  })

  it("serves cache HIT without upstream fetch", async () => {
    const fetch = vi.fn()
    const cache = { match: vi.fn(async () => jpeg()), put: vi.fn() }
    expect((await createImageHandler({ fetch, cache })(request())).status).toBe(200)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("caches a cache MISS", async () => {
    const cache = { match: vi.fn(async () => undefined), put: vi.fn(async () => undefined) }
    await createImageHandler({ fetch: vi.fn(async () => jpeg()), cache })(request())
    expect(cache.put).toHaveBeenCalledOnce()
  })

  it("keeps cache write failure non-fatal", async () => {
    const cache = { match: vi.fn(), put: vi.fn(async () => { throw new Error("down") }) }
    expect((await createImageHandler({ fetch: vi.fn(async () => jpeg()), cache })(request())).status).toBe(200)
  })

  it("rejects non-images and oversized images", async () => {
    expect((await createImageHandler({ fetch: vi.fn(async () => new Response("html", { headers: { "Content-Type": "text/html" } })) })(request())).status).toBe(502)
    const huge = new Response(null, { headers: { "Content-Type": "image/jpeg", "Content-Length": String(13 * 1024 * 1024) } })
    expect((await createImageHandler({ fetch: vi.fn(async () => huge) })(request())).status).toBe(502)
  })

  it("handles timeout safely", async () => {
    const fetch = vi.fn((_url: URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))))
    expect((await createImageHandler({ fetch: fetch as typeof globalThis.fetch, timeoutMs: 1 })(request())).status).toBe(504)
  })

  it("rejects redirects and resolver output outside Scryfall", async () => {
    const redirect = new Response(null, { status: 302, headers: { Location: "https://evil.test/x" } })
    expect((await createImageHandler({ fetch: vi.fn(async () => redirect) })(request())).status).toBe(502)
    const evil: ImageResolver = { resolve: async () => ({ url: new URL("https://evil.test/x") }) }
    expect((await createImageHandler({ fetch: vi.fn(), resolvers: new Map([[1, evil]]) })(request())).status).toBe(502)
  })

  it("supports HEAD without a response body", async () => {
    const response = await createImageHandler({ fetch: vi.fn(async () => jpeg()) })(request(undefined, "HEAD"))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("")
  })
})
