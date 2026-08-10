import {
  FirebaseAppCheckVerifier,
  validateAppCheckClaims,
} from "../src/app-check"

const encode = (value: unknown) =>
  btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")

const encodeBytes = (value: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")

const createSigner = async (kid: string) => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )
  const exported = await crypto.subtle.exportKey("jwk", pair.publicKey)
  const jwk = { ...exported, kid, alg: "RS256", use: "sig" }
  const sign = async (claims: object, header: object = { alg: "RS256", typ: "JWT", kid }) => {
    const unsigned = `${encode(header)}.${encode(claims)}`
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      pair.privateKey,
      new TextEncoder().encode(unsigned),
    )
    return `${unsigned}.${encodeBytes(signature)}`
  }
  return { jwk, sign }
}

const validClaims = {
  iss: "https://firebaseappcheck.googleapis.com/445284154827",
  aud: ["projects/445284154827"],
  sub: "1:445284154827:web:production",
  iat: 1_000,
  exp: 2_000,
}

test("bindt claims aan projectnummer, tijd en expliciete App ID", () => {
  const allowed = new Set([validClaims.sub])
  expect(
    validateAppCheckClaims(validClaims, "445284154827", allowed, 1_500),
  ).toEqual({ valid: true, appId: validClaims.sub })
  expect(
    validateAppCheckClaims(
      { ...validClaims, exp: 1_500 },
      "445284154827",
      allowed,
      1_500,
    ),
  ).toEqual({ valid: false, reason: "expired" })
  expect(
    validateAppCheckClaims(
      { ...validClaims, aud: ["projects/other"] },
      "445284154827",
      allowed,
      1_500,
    ),
  ).toEqual({ valid: false, reason: "invalid_audience" })
  expect(
    validateAppCheckClaims(
      {
        ...validClaims,
        iss: "https://firebaseappcheck.googleapis.com/other-project",
      },
      "445284154827",
      allowed,
      1_500,
    ),
  ).toEqual({ valid: false, reason: "invalid_issuer" })
  expect(
    validateAppCheckClaims(
      { ...validClaims, sub: "1:445284154827:web:beta" },
      "445284154827",
      allowed,
      1_500,
    ),
  ).toEqual({ valid: false, reason: "invalid_app_id" })
})

test("verifieert RS256 cryptografisch en cachet officiële signing keys", async () => {
  const signer = await createSigner("active-key")
  const fetcher = vi.fn(() =>
    Promise.resolve(
      Response.json(
        { keys: [signer.jwk] },
        { headers: { "Cache-Control": "public, max-age=3600" } },
      ),
    ),
  ) as typeof fetch
  const verifier = new FirebaseAppCheckVerifier(
    "445284154827",
    new Set([validClaims.sub]),
    fetcher,
    () => 1_500_000,
  )
  const token = await signer.sign(validClaims)

  await expect(verifier.verify(token)).resolves.toEqual({
    valid: true,
    appId: validClaims.sub,
  })
  await expect(verifier.verify(token)).resolves.toEqual({
    valid: true,
    appId: validClaims.sub,
  })
  expect(fetcher).toHaveBeenCalledOnce()

  const tampered = `${token.slice(0, token.lastIndexOf("."))}.AAAA`
  await expect(verifier.verify(tampered)).resolves.toEqual({
    valid: false,
    reason: "invalid_signature",
  })
})

test.each([
  [{ alg: "none", typ: "JWT", kid: "key" }, "unsupported_algorithm"],
  [{ alg: "HS256", typ: "JWT", kid: "key" }, "unsupported_algorithm"],
  [{ alg: "RS256", kid: "key" }, "unsupported_algorithm"],
] as const)("weigert een onveilige JWT-header", async (header, reason) => {
  const verifier = new FirebaseAppCheckVerifier(
    "445284154827",
    new Set([validClaims.sub]),
    vi.fn() as typeof fetch,
    () => 1_500_000,
  )
  await expect(
    verifier.verify(`${encode(header)}.${encode(validClaims)}.signature`),
  ).resolves.toEqual({ valid: false, reason })
})

test("refresht gecontroleerd bij keyrotatie", async () => {
  const oldSigner = await createSigner("old-key")
  const newSigner = await createSigner("new-key")
  let now = 1_500_000
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ keys: [oldSigner.jwk] }))
    .mockResolvedValueOnce(Response.json({ keys: [newSigner.jwk] })) as typeof fetch
  const verifier = new FirebaseAppCheckVerifier(
    "445284154827",
    new Set([validClaims.sub]),
    fetcher,
    () => now,
  )
  expect((await verifier.verify(await oldSigner.sign(validClaims))).valid).toBe(true)
  now += 61_000
  expect((await verifier.verify(await newSigner.sign(validClaims))).valid).toBe(true)
  expect(fetcher).toHaveBeenCalledTimes(2)
})

test("classificeert malformed, onbekende keys en JWKS-uitval veilig", async () => {
  const signer = await createSigner("known-key")
  const verifier = new FirebaseAppCheckVerifier(
    "445284154827",
    new Set([validClaims.sub]),
    vi.fn(() => Promise.resolve(Response.json({ keys: [signer.jwk] }))) as typeof fetch,
    () => 1_500_000,
  )
  await expect(verifier.verify("geen-jwt")).resolves.toEqual({
    valid: false,
    reason: "malformed",
  })
  const unknownSigner = await createSigner("unknown-key")
  await expect(
    verifier.verify(await unknownSigner.sign(validClaims)),
  ).resolves.toEqual({ valid: false, reason: "unknown_signing_key" })

  const unavailable = new FirebaseAppCheckVerifier(
    "445284154827",
    new Set([validClaims.sub]),
    vi.fn(() => Promise.reject(new Error("offline"))) as typeof fetch,
    () => 1_500_000,
  )
  await expect(unavailable.verify(await signer.sign(validClaims))).resolves.toEqual({
    valid: false,
    reason: "key_fetch_failed",
  })
})
