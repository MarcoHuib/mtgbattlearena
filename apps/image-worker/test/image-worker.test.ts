import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { createImageHandler, fetcher, type ImageResolver } from "../src/index"

const id = "6a9c39e4-a8cf-42dd-8d0e-45634b335546"
const request = (path = `/v1/1/${id}/0/normal`, method = "GET") =>
  new Request(`https://cdn.mtgbattlearena.nl${path}`, { method })
const jpeg = () =>
  new Response(new Uint8Array([1, 2, 3]), {
    headers: { "Content-Type": "image/jpeg" },
  })

describe("image CDN boundary", () => {
  it("enables pre-execution Workers Caching only in production", () => {
    const wrangler = readFileSync(
      new URL("../wrangler.toml", import.meta.url),
      "utf8",
    )
    expect(wrangler).toMatch(/\[cache\]\s+enabled = true/)
    expect(wrangler).toMatch(/cross_version_cache = false/)
    expect(wrangler).toMatch(/\[env\.staging\.cache\]\s+enabled = false/)
  })

  it("returns a long edge-cacheable JPEG without private headers", async () => {
    const fetch = vi.fn((input: URL | RequestInfo) => {
      void input
      return Promise.resolve(jpeg())
    })
    const response = await createImageHandler({ fetcher: fetch })(request())
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("image/jpeg")
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=86400")
    expect(response.headers.get("Cloudflare-CDN-Cache-Control")).toBe(
      "public, max-age=2592000",
    )
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe(
      "cross-origin",
    )
    expect(response.headers.get("Cache-Control")).not.toMatch(
      /immutable|private|no-store/,
    )
    expect(response.headers.has("Set-Cookie")).toBe(false)
    const upstream = fetch.mock.calls[0]?.[0]
    expect(upstream).toBeInstanceOf(URL)
    expect((upstream as URL).href).toBe(
      `https://cards.scryfall.io/normal/front/6/a/${id}.jpg`,
    )
  })

  it("follows a safe Scryfall redirect and returns the JPEG", async () => {
    const redirected = `https://cards.scryfall.io/normal/front/6/a/${id}-canonical.jpg`
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { Location: redirected } }),
      )
      .mockResolvedValueOnce(jpeg())
    const log = { warn: vi.fn(), error: vi.fn() }
    const response = await createImageHandler({ fetcher: fetch, log })(
      request(),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("image/jpeg")
    expect(fetch).toHaveBeenCalledTimes(2)
    expect((fetch.mock.calls[1]?.[0] as URL).href).toBe(redirected)
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" })
    expect(log.warn).toHaveBeenCalledWith(
      "Image upstream redirect",
      expect.objectContaining({
        status: 302,
        host: "cards.scryfall.io",
        redirectHost: "cards.scryfall.io",
      }),
    )
  })

  it.each([
    ["unknown resolver", `/v1/2/${id}/0/normal`],
    ["malformed id", "/v1/1/https:%2F%2Fevil.test/x/0/normal"],
    ["unsupported variant", `/v1/1/${id}/0/large`],
    ["unsupported face", `/v1/1/${id}/2/normal`],
    ["query input", `/v1/1/${id}/0/normal?url=https://evil.test`],
    ["old misleading extension", `/v1/1/${id}/0/normal.webp`],
  ])("rejects %s without long-lived caching", async (_name, path) => {
    const response = await createImageHandler({ fetcher: vi.fn() })(
      request(path),
    )
    expect(response.status).toBe(404)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(response.headers.get("Cloudflare-CDN-Cache-Control")).toBe(
      "no-store",
    )
  })

  it("does not long-cache upstream errors", async () => {
    for (const upstream of [
      new Response(null, { status: 429 }),
      new Response(null, { status: 500 }),
      new Response("html", { headers: { "Content-Type": "text/html" } }),
      new Response(null, {
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Length": String(13 * 1024 * 1024),
        },
      }),
    ]) {
      const response = await createImageHandler({
        fetcher: vi.fn(() => Promise.resolve(upstream)),
      })(request())
      expect(response.ok).toBe(false)
      expect(response.headers.get("Cache-Control")).toBe("no-store")
      expect(response.headers.get("Cloudflare-CDN-Cache-Control")).toBe(
        "no-store",
      )
    }
  })

  it("handles timeout without cacheable failure metadata", async () => {
    const fetch = vi.fn(
      (_url: URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"))
          })
        }),
    )
    const response = await createImageHandler({
      fetcher: fetch as typeof globalThis.fetch,
      timeoutMs: 1,
    })(request())
    expect(response.status).toBe(504)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
  })

  it("rejects a redirect outside Scryfall without fetching it", async () => {
    const redirect = new Response(null, {
      status: 302,
      headers: { Location: "https://evil.test/x" },
    })
    const fetch = vi.fn(() => Promise.resolve(redirect))
    expect(
      (
        await createImageHandler({
          fetcher: fetch,
        })(request())
      ).status,
    ).toBe(502)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("rejects resolver output outside Scryfall", async () => {
    const evil: ImageResolver = {
      resolve: () => Promise.resolve({ url: new URL("https://evil.test/x") }),
    }
    expect(
      (
        await createImageHandler({
          fetcher: vi.fn(),
          resolvers: new Map([[1, evil]]),
        })(request())
      ).status,
    ).toBe(502)
  })

  it("returns 502 and logs safe diagnostics for a fetch exception", async () => {
    const log = { warn: vi.fn(), error: vi.fn() }
    const response = await createImageHandler({
      fetcher: vi.fn(() => Promise.reject(new TypeError("network failed"))),
      log,
    })(request())
    expect(response.status).toBe(502)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(log.error).toHaveBeenCalledWith("Image upstream fetch failed", {
      host: "cards.scryfall.io",
      path: `/normal/front/6/a/${id}.jpg`,
      errorName: "TypeError",
      errorMessage: "network failed",
    })
  })

  it("calls global fetch through a this-independent injected wrapper", async () => {
    const nativeFetch = vi.fn(function (this: unknown) {
      if (this !== undefined)
        throw new TypeError("Illegal invocation: incorrect this reference")
      return Promise.resolve(jpeg())
    })
    vi.stubGlobal("fetch", nativeFetch)
    try {
      const response = await createImageHandler({ fetcher })(request())
      expect(response.status).toBe(200)
      expect(nativeFetch).toHaveBeenCalledOnce()
      expect(nativeFetch.mock.instances[0]).toBeUndefined()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("HEAD returns the same content/cache metadata and no body", async () => {
    const response = await createImageHandler({
      fetcher: vi.fn(() => Promise.resolve(jpeg())),
    })(request(undefined, "HEAD"))
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("image/jpeg")
    expect(response.headers.get("Cloudflare-CDN-Cache-Control")).toBe(
      "public, max-age=2592000",
    )
    expect(await response.text()).toBe("")
  })
})
