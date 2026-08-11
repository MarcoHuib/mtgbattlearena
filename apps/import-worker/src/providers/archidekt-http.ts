const ARCHIDEKT_HOSTS = new Set(["archidekt.com", "www.archidekt.com"])
const MAX_REDIRECTS = 3

export const ARCHIDEKT_MAX_RESPONSE_BYTES = 5_000_000
export const ARCHIDEKT_TIMEOUT_MS = 10_000

export const archidektDeckApiUrl = (sourceId: string) =>
  `https://archidekt.com/api/decks/${encodeURIComponent(sourceId)}/`

export const archidektTokensApiUrl = (tokenIds: readonly string[]) =>
  `https://archidekt.com/api/cards/v2/?oracleCardIds=${encodeURIComponent(tokenIds.join(","))}&includeTokens&unique`

export class ArchidektHttpError extends Error {
  readonly upstreamStatus?: number
  readonly upstreamHostname: string
  readonly upstreamPath: string

  constructor(
    message: string,
    url: URL,
    options: { cause?: unknown; upstreamStatus?: number } = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    )
    this.name = "ArchidektHttpError"
    this.upstreamStatus = options.upstreamStatus
    this.upstreamHostname = url.hostname
    this.upstreamPath = url.pathname
  }
}

const assertSafeArchidektUrl = (url: URL) => {
  if (
    url.protocol !== "https:" ||
    !ARCHIDEKT_HOSTS.has(url.hostname.toLowerCase()) ||
    url.port ||
    url.username ||
    url.password ||
    !url.pathname.startsWith("/api/")
  )
    throw new ArchidektHttpError("Archidekt redirect werd geweigerd.", url)
}

export type ArchidektJsonResponse = {
  data: unknown
  payload: ArrayBuffer
  status: number
  finalUrl: URL
}

/** Shared allowlisted JSON client for freshness and authoritative imports. */
export const fetchArchidektJson = async (
  input: string,
  fetcher: typeof fetch = fetch,
): Promise<ArchidektJsonResponse> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, ARCHIDEKT_TIMEOUT_MS)
  let current = new URL(input)
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      assertSafeArchidektUrl(current)
      let response: Response
      try {
        response = await fetcher(current.href, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": "MTGBattleMode/1.0",
          },
          redirect: "manual",
          signal: controller.signal,
        })
      } catch (error) {
        throw new ArchidektHttpError(
          error instanceof DOMException && error.name === "AbortError"
            ? "Archidekt request timed out."
            : "Archidekt request failed.",
          current,
          { cause: error },
        )
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("Location")
        if (!location || redirects === MAX_REDIRECTS)
          throw new ArchidektHttpError(
            "Archidekt redirect werd geweigerd.",
            current,
            {
              upstreamStatus: response.status,
            },
          )
        current = new URL(location, current)
        continue
      }
      if (!response.ok)
        throw new ArchidektHttpError(
          "Archidekt gaf een foutstatus terug.",
          current,
          {
            upstreamStatus: response.status,
          },
        )
      const declaredSize = Number(response.headers.get("Content-Length") ?? 0)
      if (declaredSize > ARCHIDEKT_MAX_RESPONSE_BYTES)
        throw new ArchidektHttpError(
          "Archidekt response is te groot.",
          current,
          {
            upstreamStatus: 413,
          },
        )
      const payload = await response.arrayBuffer()
      if (payload.byteLength > ARCHIDEKT_MAX_RESPONSE_BYTES)
        throw new ArchidektHttpError(
          "Archidekt response is te groot.",
          current,
          {
            upstreamStatus: 413,
          },
        )
      try {
        return {
          data: JSON.parse(new TextDecoder().decode(payload)),
          payload,
          status: response.status,
          finalUrl: current,
        }
      } catch (error) {
        throw new ArchidektHttpError(
          "Archidekt response bevat ongeldige JSON.",
          current,
          {
            cause: error,
            upstreamStatus: response.status,
          },
        )
      }
    }
    throw new ArchidektHttpError("Archidekt redirect werd geweigerd.", current)
  } finally {
    clearTimeout(timeout)
  }
}
