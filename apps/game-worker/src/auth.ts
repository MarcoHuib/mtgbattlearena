import type { VerifiedIdentity } from "./types"

type JwtHeader = {
  alg: string
  kid: string
}

export type FirebaseClaims = {
  aud: string
  iss: string
  sub: string
  exp: number
  iat: number
  auth_time?: number
  name?: string
  email?: string
  firebase?: { sign_in_provider?: string }
}

type CertificateCache = {
  expiresAt: number
  certificates: Record<string, FirebaseJwk>
}

type FirebaseJwk = JsonWebKey & { kid?: string }

const CERTIFICATE_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"

const decodeBase64Url = (value: string) => {
  const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat(
    (4 - (value.length % 4)) % 4,
  )}`
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0))
}

const decodeJson = (value: string): unknown =>
  JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as unknown

export const validateFirebaseClaims = (
  claims: FirebaseClaims,
  projectId: string,
  nowSeconds: number,
): VerifiedIdentity => {
  if (claims.aud !== projectId) throw new Error("Ongeldige token-audience.")
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error("Ongeldige token-issuer.")
  }
  if (!claims.sub || claims.sub.length > 128) {
    throw new Error("Ongeldige Firebase-gebruikers-ID.")
  }
  if (!Number.isFinite(claims.exp) || claims.exp <= nowSeconds) {
    throw new Error("Het Firebase-token is verlopen.")
  }
  if (!Number.isFinite(claims.iat) || claims.iat > nowSeconds + 60) {
    throw new Error("Ongeldige uitgiftetijd in Firebase-token.")
  }
  if (claims.auth_time !== undefined && claims.auth_time > nowSeconds + 60) {
    throw new Error("Ongeldige authenticatietijd in Firebase-token.")
  }
  return {
    uid: claims.sub,
    name: claims.name,
    email: claims.email,
    anonymous: claims.firebase?.sign_in_provider === "anonymous",
  }
}

export class FirebaseTokenVerifier {
  private certificateCache: CertificateCache | null = null
  private readonly fetcher: typeof fetch

  constructor(
    private readonly projectId: string,
    fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {
    this.fetcher = fetcher.bind(globalThis)
  }

  async verify(token: string): Promise<VerifiedIdentity> {
    const parts = token.split(".")
    if (parts.length !== 3) throw new Error("Ongeldig JWT-formaat.")
    const [encodedHeader, encodedClaims, encodedSignature] = parts
    if (!encodedHeader || !encodedClaims || !encodedSignature) {
      throw new Error("Ongeldig JWT-formaat.")
    }
    const header = decodeJson(encodedHeader) as JwtHeader
    if (header.alg !== "RS256" || !header.kid) {
      throw new Error("Ongeldig JWT-algoritme.")
    }
    const certificates = await this.getCertificates()
    const certificate = certificates[header.kid]
    if (!certificate) throw new Error("Onbekende Firebase-certificaatsleutel.")

    const key = await crypto.subtle.importKey(
      "jwk",
      certificate,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    )
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`),
    )
    if (!valid) throw new Error("Ongeldige Firebase-tokenhandtekening.")

    return validateFirebaseClaims(
      decodeJson(encodedClaims) as FirebaseClaims,
      this.projectId,
      Math.floor(this.now() / 1_000),
    )
  }

  private async getCertificates() {
    const now = this.now()
    if (this.certificateCache && this.certificateCache.expiresAt > now) {
      return this.certificateCache.certificates
    }
    const response = await this.fetcher(CERTIFICATE_URL)
    if (!response.ok)
      throw new Error("Firebase-certificaten zijn niet bereikbaar.")
    const body = (await response.json()) as { keys?: FirebaseJwk[] }
    const certificates = Object.fromEntries(
      (body.keys ?? []).flatMap(key =>
        typeof key.kid === "string" ? [[key.kid, key]] : [],
      ),
    )
    if (Object.keys(certificates).length === 0) {
      throw new Error("Firebase-certificatenantwoord is ongeldig.")
    }
    const cacheControl = response.headers.get("Cache-Control") ?? ""
    const maxAge = Number(/max-age=(\d+)/.exec(cacheControl)?.[1] ?? 300)
    this.certificateCache = {
      certificates,
      expiresAt: now + Math.max(60, maxAge) * 1_000,
    }
    return certificates
  }
}

export const readBearerToken = (request: Request) => {
  const authorization = request.headers.get("Authorization")
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? "")
  if (!match?.[1]) throw new Error("AUTH_REQUIRED")
  return match[1]
}
