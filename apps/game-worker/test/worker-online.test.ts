import {
  FirebaseTokenVerifier,
  validateFirebaseClaims,
  type FirebaseClaims,
} from "../src/auth"
import worker, { isOriginAllowed } from "../src/index"
import {
  MemorySocketTicketRepository,
  SocketTicketService,
} from "../src/tickets"
import type { Env } from "../src/types"

test("Firebase-claims worden aan project, issuer en tijd gebonden", () => {
  const claims: FirebaseClaims = {
    aud: "battle-project",
    iss: "https://securetoken.google.com/battle-project",
    sub: "firebase-user",
    exp: 2_000,
    iat: 1_000,
    firebase: { sign_in_provider: "anonymous" },
  }
  expect(validateFirebaseClaims(claims, "battle-project", 1_500)).toEqual({
    uid: "firebase-user",
    name: undefined,
    email: undefined,
    anonymous: true,
  })
  expect(() =>
    validateFirebaseClaims(
      { ...claims, aud: "ander-project" },
      "battle-project",
      1_500,
    ),
  ).toThrow("audience")
  expect(() =>
    validateFirebaseClaims({ ...claims, exp: 1_499 }, "battle-project", 1_500),
  ).toThrow("verlopen")
})

test("Firebase-certificaten worden met de globale fetch-context opgehaald", async () => {
  const fetcher = function (this: unknown) {
    expect(this).toBe(globalThis)
    return Promise.resolve(
      Response.json(
        { keys: [] },
        { headers: { "Cache-Control": "public, max-age=300" } },
      ),
    )
  } as typeof fetch
  const verifier = new FirebaseTokenVerifier(
    "battle-project",
    fetcher,
    () => 1_500_000,
  )
  const header = btoa(JSON.stringify({ alg: "RS256", kid: "test-key" }))
  const claims = btoa(JSON.stringify({ aud: "battle-project" }))

  await expect(
    verifier.verify(`${header}.${claims}.c2lnbmF0dXJl`),
  ).rejects.toThrow("certificatenantwoord")
})

test("socket-ticket is kortlevend en exact eenmaal te gebruiken", async () => {
  let now = Date.parse("2026-07-29T18:00:00.000Z")
  const service = new SocketTicketService(
    new MemorySocketTicketRepository(),
    () => now,
  )
  const issued = await service.issue({
    gameId: "game",
    uid: "verified-user",
    playerId: "server-assigned-player",
    role: "player",
    isHost: true,
  })
  expect(new Date(issued.expiresAt).getTime() - now).toBe(30_000)
  expect(await service.consume(issued.ticket)).toMatchObject({
    gameId: "game",
    uid: "verified-user",
    playerId: "server-assigned-player",
  })
  expect(await service.consume(issued.ticket)).toBeNull()

  const expired = await service.issue({
    gameId: "game",
    uid: "other-user",
    playerId: null,
    role: "spectator",
    isHost: false,
  })
  now += 31_000
  expect(await service.consume(expired.ticket)).toBeNull()
})

test("CORS accepteert uitsluitend exact geconfigureerde origins", () => {
  const configured =
    "http://localhost:5173, https://mtgbattlearena.nl, https://mtgbattlearena.web.app"

  expect(isOriginAllowed("http://localhost:5173", configured)).toBe(true)
  expect(isOriginAllowed("https://mtgbattlearena.nl", configured)).toBe(true)
  expect(isOriginAllowed("https://mtgbattlearena.web.app", configured)).toBe(
    true,
  )
  expect(isOriginAllowed("https://aanvaller.example", configured)).toBe(false)
  expect(
    isOriginAllowed("http://localhost:5173.attacker.example", configured),
  ).toBe(false)
})

test("custom domains scheiden REST, imports en WebSockets", async () => {
  const importFetch = vi.fn(() =>
    Promise.resolve(Response.json({ name: "Deck via import-service" })),
  )
  const env = {
    IMPORT: { fetch: importFetch },
    ALLOWED_ORIGIN: "https://mtgbattlearena.nl",
  } as unknown as Env

  const imported = await worker.fetch(
    new Request("https://api.mtgbattlearena.nl/api/import/archidekt/24190600", {
      headers: { Origin: "https://mtgbattlearena.nl" },
    }),
    env,
  )
  expect(imported.status).toBe(200)
  expect(await imported.json()).toEqual({ name: "Deck via import-service" })
  expect(importFetch).toHaveBeenCalledOnce()

  const socketOnApi = await worker.fetch(
    new Request("https://api.mtgbattlearena.nl/api/online/socket"),
    env,
  )
  expect(socketOnApi.status).toBe(404)

  const restOnSocket = await worker.fetch(
    new Request("https://ws.mtgbattlearena.nl/api/online/health"),
    env,
  )
  expect(restOnSocket.status).toBe(404)
})
