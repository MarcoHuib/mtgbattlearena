import {
  FirebaseTokenVerifier,
  validateFirebaseClaims,
  type FirebaseClaims,
} from "../src/auth"
import worker, {
  isOriginAllowed,
  readAppCheckEnforcementMode,
} from "../src/index"
import {
  hashSocketTicket,
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
  const repository = new MemorySocketTicketRepository()
  const service = new SocketTicketService(repository, () => now)
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
  expect(repository.has(await hashSocketTicket(issued.ticket))).toBe(false)
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
  expect(repository.size).toBe(0)
  await expect(repository.cleanup(now)).resolves.toBe(0)
  await expect(repository.cleanup(now)).resolves.toBe(0)
})

test("begrenst ongebruikte socket-tickets per gebruiker en game", async () => {
  const service = new SocketTicketService(new MemorySocketTicketRepository())
  const session = {
    gameId: "quota-game",
    uid: "verified-user",
    playerId: "player",
    role: "player" as const,
    isHost: false,
  }

  await expect(service.issue(session)).resolves.toHaveProperty("ticket")
  await expect(service.issue(session)).resolves.toHaveProperty("ticket")
  await expect(service.issue(session)).rejects.toMatchObject({
    reason: "outstanding-limit",
  })
  await expect(
    service.issue({ ...session, gameId: "other-game" }),
  ).resolves.toHaveProperty("ticket")
})

test("begrenst ticketuitgiftepogingen tot tien per minuut", async () => {
  let now = Date.parse("2026-07-29T18:00:00.000Z")
  const repository = new MemorySocketTicketRepository()
  const service = new SocketTicketService(repository, () => now)
  const session = {
    gameId: "rate-game",
    uid: "verified-user",
    playerId: "player",
    role: "player" as const,
    isHost: false,
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const issued = await service.issue(session)
    await service.consume(issued.ticket)
  }
  await expect(service.issue(session)).rejects.toMatchObject({
    reason: "rate-limit",
  })

  now += 60_000
  await expect(service.issue(session)).resolves.toHaveProperty("ticket")
})

test("gelijktijdige consumptie kan maar eenmaal slagen", async () => {
  const repository = new MemorySocketTicketRepository()
  const service = new SocketTicketService(repository)
  const issued = await service.issue({
    gameId: "race-game",
    uid: "verified-user",
    playerId: "player",
    role: "player",
    isHost: false,
  })

  const results = await Promise.all([
    service.consume(issued.ticket),
    service.consume(issued.ticket),
  ])
  expect(results.filter(Boolean)).toHaveLength(1)
  expect(results.filter(result => result === null)).toHaveLength(1)
  expect(repository.size).toBe(0)
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

test("App Check modes zijn expliciet en onbekende waarden falen veilig", () => {
  expect(readAppCheckEnforcementMode()).toBe("off")
  expect(readAppCheckEnforcementMode("off")).toBe("off")
  expect(readAppCheckEnforcementMode("monitor")).toBe("monitor")
  expect(readAppCheckEnforcementMode("enforce")).toBe("enforce")
  expect(readAppCheckEnforcementMode("typo")).toBe("enforce")
})

test("enforce blokkeert protected imports, monitor observeert en health blijft publiek", async () => {
  const importFetch = vi.fn(() => Promise.resolve(Response.json({ ok: true })))
  const baseEnv = {
    IMPORT: { fetch: importFetch },
    FIREBASE_PROJECT_NUMBER: "445284154827",
    FIREBASE_ALLOWED_APP_IDS: "1:445284154827:web:production",
    ALLOWED_ORIGIN: "https://mtgbattlearena.nl",
  } as unknown as Env
  const importRequest = new Request(
    "https://api.mtgbattlearena.nl/api/import/archidekt/24190600",
    { headers: { Origin: "https://mtgbattlearena.nl" } },
  )

  const blocked = await worker.fetch(importRequest.clone(), {
    ...baseEnv,
    APP_CHECK_ENFORCEMENT: "enforce",
  })
  expect(blocked.status).toBe(403)
  await expect(blocked.json()).resolves.toMatchObject({
    code: "APP_CHECK_REQUIRED",
  })
  expect(importFetch).not.toHaveBeenCalled()

  const monitored = await worker.fetch(
    new Request(importRequest, {
      headers: {
        Origin: "https://mtgbattlearena.nl",
        "X-Firebase-AppCheck": "malformed",
      },
    }),
    { ...baseEnv, APP_CHECK_ENFORCEMENT: "monitor" },
  )
  expect(monitored.status).toBe(200)
  expect(importFetch).toHaveBeenCalledOnce()

  const health = await worker.fetch(
    new Request("https://api.mtgbattlearena.nl/api/online/health"),
    { ...baseEnv, APP_CHECK_ENFORCEMENT: "enforce" },
  )
  expect(health.status).toBe(200)
})

test("preflight staat alleen vereiste securityheaders toe", async () => {
  const response = await worker.fetch(
    new Request("https://api.mtgbattlearena.nl/api/online/lobbies", {
      method: "OPTIONS",
      headers: { Origin: "https://mtgbattlearena.nl" },
    }),
    {
      ALLOWED_ORIGIN: "https://mtgbattlearena.nl",
      APP_CHECK_ENFORCEMENT: "enforce",
    } as unknown as Env,
  )
  expect(response.status).toBe(204)
  expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
    "Authorization, Content-Type, X-Firebase-AppCheck",
  )
})

test("socket-ticket controleert Auth vóór App Check", async () => {
  const response = await worker.fetch(
    new Request("https://api.mtgbattlearena.nl/api/online/socket-ticket", {
      method: "POST",
      body: JSON.stringify({ gameId: "game" }),
    }),
    {
      APP_CHECK_ENFORCEMENT: "enforce",
      FIREBASE_PROJECT_NUMBER: "445284154827",
      FIREBASE_ALLOWED_APP_IDS: "1:445284154827:web:production",
      LOBBY: { getByName: vi.fn(() => ({})) },
    } as unknown as Env,
  )
  expect(response.status).toBe(401)
  await expect(response.json()).resolves.toMatchObject({ code: "AUTH_REQUIRED" })
})

test("socketlimiet-afwijzing maakt een verbruikt ticket niet herbruikbaar", async () => {
  const session = {
    gameId: "limited-game",
    uid: "verified-user",
    playerId: "player",
    role: "player" as const,
    isHost: false,
  }
  let available = true
  const gameFetch = vi.fn(() =>
    Promise.resolve(
      Response.json(
        { code: "WEBSOCKET_CONNECTION_LIMIT_REACHED" },
        { status: 429 },
      ),
    ),
  )
  const env = {
    LOBBY: {
      getByName: () => ({
        consumeSocketTicket: () => {
          if (!available) return Promise.resolve(null)
          available = false
          return Promise.resolve(session)
        },
      }),
    },
    GAMES: { getByName: () => ({ fetch: gameFetch }) },
  } as unknown as Env

  const first = await worker.fetch(
    new Request(
      "https://ws.mtgbattlearena.nl/api/online/socket?ticket=single-use-ticket",
    ),
    env,
  )
  expect(first.status).toBe(429)
  const second = await worker.fetch(
    new Request(
      "https://ws.mtgbattlearena.nl/api/online/socket?ticket=single-use-ticket",
    ),
    env,
  )
  expect(second.status).toBe(401)
  expect(gameFetch).toHaveBeenCalledOnce()
})
