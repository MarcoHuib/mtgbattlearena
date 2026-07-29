import {
  validateFirebaseClaims,
  type FirebaseClaims,
} from "../worker/online/auth"
import {
  MemorySocketTicketRepository,
  SocketTicketService,
} from "../worker/online/tickets"

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
