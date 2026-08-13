export const FIREBASE_APP_CHECK_JWKS_URL =
  "https://firebaseappcheck.googleapis.com/v1/jwks"

export const APP_CHECK_HEADER = "X-Firebase-AppCheck"

export type AppCheckFailureReason =
  | "missing"
  | "malformed"
  | "invalid_signature"
  | "expired"
  | "invalid_issuer"
  | "invalid_audience"
  | "invalid_project"
  | "invalid_app_id"
  | "unsupported_algorithm"
  | "unknown_signing_key"
  | "key_fetch_failed"

export type AppCheckVerificationResult =
  | { valid: true; appId: string }
  | { valid: false; reason: AppCheckFailureReason }

type AppCheckHeader = { alg?: unknown; kid?: unknown; typ?: unknown }
type AppCheckClaims = {
  aud?: unknown
  iss?: unknown
  sub?: unknown
  exp?: unknown
  iat?: unknown
}
type FirebaseJwk = JsonWebKey & {
  kid?: string
  alg?: string
  use?: string
  kty?: string
}
type KeyCache = { expiresAt: number; keys: Record<string, FirebaseJwk> }

const decodeBase64Url = (value: string) => {
  const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat(
    (4 - (value.length % 4)) % 4,
  )}`
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0))
}

const decodeJson = (value: string): unknown =>
  JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as unknown

export const validateAppCheckClaims = (
  claims: AppCheckClaims,
  projectNumber: string,
  allowedAppIds: ReadonlySet<string>,
  nowSeconds: number,
): AppCheckVerificationResult => {
  if (
    claims.iss !== `https://firebaseappcheck.googleapis.com/${projectNumber}`
  ) {
    return { valid: false, reason: "invalid_issuer" }
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!audiences.includes(`projects/${projectNumber}`)) {
    return { valid: false, reason: "invalid_audience" }
  }
  if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) {
    return { valid: false, reason: "expired" }
  }
  if (
    typeof claims.iat !== "number" ||
    claims.iat > nowSeconds + 60 ||
    claims.iat >= claims.exp
  ) {
    return { valid: false, reason: "malformed" }
  }
  if (typeof claims.sub !== "string" || !allowedAppIds.has(claims.sub)) {
    return { valid: false, reason: "invalid_app_id" }
  }
  return { valid: true, appId: claims.sub }
}

export class FirebaseAppCheckVerifier {
  private cache: KeyCache | null = null
  private lastFetchAt = 0
  private readonly fetcher: typeof fetch

  constructor(
    private readonly projectNumber: string,
    private readonly allowedAppIds: ReadonlySet<string>,
    fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {
    this.fetcher = fetcher.bind(globalThis)
  }

  async verify(token: string | null): Promise<AppCheckVerificationResult> {
    if (!token) return { valid: false, reason: "missing" }
    try {
      const parts = token.split(".")
      if (parts.length !== 3 || parts.some(part => !part)) {
        return { valid: false, reason: "malformed" }
      }
      const [encodedHeader, encodedClaims, encodedSignature] = parts as [
        string,
        string,
        string,
      ]
      const header = decodeJson(encodedHeader) as AppCheckHeader
      if (header.alg !== "RS256" || header.typ !== "JWT") {
        return { valid: false, reason: "unsupported_algorithm" }
      }
      if (typeof header.kid !== "string" || !header.kid) {
        return { valid: false, reason: "malformed" }
      }

      let keys = await this.getKeys(false)
      let jwk = keys[header.kid]
      if (!jwk && this.now() - this.lastFetchAt >= 60_000) {
        keys = await this.getKeys(true)
        jwk = keys[header.kid]
      }
      if (!jwk) return { valid: false, reason: "unknown_signing_key" }
      if (jwk.alg !== "RS256" || jwk.kty !== "RSA" || jwk.use !== "sig") {
        return { valid: false, reason: "unsupported_algorithm" }
      }

      const key = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      )
      const signatureValid = await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        decodeBase64Url(encodedSignature),
        new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`),
      )
      if (!signatureValid) {
        return { valid: false, reason: "invalid_signature" }
      }
      return validateAppCheckClaims(
        decodeJson(encodedClaims) as AppCheckClaims,
        this.projectNumber,
        this.allowedAppIds,
        Math.floor(this.now() / 1_000),
      )
    } catch (error) {
      return {
        valid: false,
        reason:
          error instanceof Error && error.message === "KEY_FETCH_FAILED"
            ? "key_fetch_failed"
            : "malformed",
      }
    }
  }

  private async getKeys(force: boolean) {
    const now = this.now()
    if (!force && this.cache && this.cache.expiresAt > now) {
      return this.cache.keys
    }
    let response: Response
    try {
      response = await this.fetcher(FIREBASE_APP_CHECK_JWKS_URL)
    } catch {
      throw new Error("KEY_FETCH_FAILED")
    }
    if (!response.ok) throw new Error("KEY_FETCH_FAILED")
    const body = (await response.json()) as { keys?: FirebaseJwk[] }
    const keys = Object.fromEntries(
      (body.keys ?? []).flatMap(key =>
        typeof key.kid === "string" ? [[key.kid, key]] : [],
      ),
    )
    if (Object.keys(keys).length === 0) throw new Error("KEY_FETCH_FAILED")
    const cacheControl = response.headers.get("Cache-Control") ?? ""
    const maxAge = Number(/max-age=(\d+)/.exec(cacheControl)?.[1] ?? 300)
    this.lastFetchAt = now
    this.cache = {
      keys,
      expiresAt: now + Math.min(21_600, Math.max(60, maxAge)) * 1_000,
    }
    return keys
  }
}

export const parseAllowedAppIds = (configured: string | undefined) =>
  new Set(
    (configured ?? "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean),
  )
