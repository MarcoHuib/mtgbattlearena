import { persistedOperations } from "../src/graphql/persistedOperations.generated"
import worker from "../src/index"
import {
  LOBBY_CREATOR_UIDS,
  canCreateLobby,
  resolveLobbyCreationMode,
} from "../src/multiplayer-access"
import type * as AuthModule from "../src/auth"
import type { Env } from "../src/types"

// Token = "uid:<uid>"; alles anders is ongeldig. De echte signatuurcontrole
// wordt in worker-online.test.ts gedekt.
vi.mock("../src/auth", async importOriginal => {
  const original = await importOriginal<typeof AuthModule>()
  return {
    ...original,
    FirebaseTokenVerifier: class {
      verify(token: string) {
        if (!token.startsWith("uid:")) {
          return Promise.reject(new Error("Ongeldig JWT-formaat."))
        }
        return Promise.resolve({ uid: token.slice(4), anonymous: false })
      }
    },
  }
})

const OWNER = "6xBlqTtsTje2nOmSWD6tbz83Wiu1"
const OTHER = "someone-else"

const lobbyStub = {
  listPublicLobbies: vi.fn(() => []),
  createLobby: vi.fn(() => ({ ok: true, value: { id: "g1" } })),
  joinByCode: vi.fn(() => ({ ok: true, value: { gameId: "g1" } })),
  getLobbyRoom: vi.fn(() => ({ ok: true, value: {} })),
  deleteLobby: vi.fn(() => ({ ok: true, value: null })),
  issueSocketTicket: vi.fn(() => ({ ok: true, value: { ticket: "t" } })),
  getSession: vi.fn(() => null),
  registerDeck: vi.fn(() => ({ ok: true, value: null })),
}
const gameFetch = vi.fn(() => Promise.resolve(new Response("ok")))

const envFor = (appEnv: "production" | "staging") =>
  ({
    APP_ENV: appEnv,
    FIREBASE_PROJECT_ID: "project",
    APP_CHECK_ENFORCEMENT: "off",
    LOBBY: { getByName: () => lobbyStub },
    GAMES: { getByName: () => ({ fetch: gameFetch }) },
  }) as unknown as Env

const call = (
  env: Env,
  path: string,
  token: string | null,
  init: RequestInit = {},
) =>
  worker.fetch(
    new Request(`https://api.mtgbattlearena.nl${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }),
    env,
  )

const createLobbyBody = JSON.stringify({
  title: "Test",
  format: "Commander",
  visibility: "public",
  maxPlayers: 4,
})

const hashOf = (name: string) =>
  Object.entries(persistedOperations).find(
    ([, operation]) => operation.operationName === name,
  )?.[0] ?? ""

beforeEach(() => {
  vi.clearAllMocks()
})

describe.each(["production", "staging"] as const)("%s", appEnv => {
  const env = envFor(appEnv)

  test("allowlisted UID mag lobbies aanmaken met de geverifieerde uid", async () => {
    const response = await call(env, "/api/online/lobbies", `uid:${OWNER}`, {
      method: "POST",
      body: createLobbyBody,
    })
    expect(response.status).toBe(201)
    expect(lobbyStub.createLobby).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ uid: OWNER }),
    )
  })

  test("andere ingelogde UID mag geen lobby aanmaken (REST)", async () => {
    const response = await call(env, "/api/online/lobbies", `uid:${OTHER}`, {
      method: "POST",
      body: createLobbyBody,
    })
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      code: "LOBBY_CREATION_RESTRICTED",
    })
    expect(lobbyStub.createLobby).not.toHaveBeenCalled()
  })

  test("andere ingelogde UID kan lijsten, joinen, lobby lezen, ticket halen en verlaten", async () => {
    const token = `uid:${OTHER}`
    expect((await call(env, "/api/online/lobbies", token)).status).toBe(200)
    expect(
      (
        await call(env, "/api/online/lobbies/join", token, {
          method: "POST",
          body: JSON.stringify({ code: "ABCDEF", role: "player" }),
        })
      ).status,
    ).toBe(200)
    expect((await call(env, "/api/online/lobbies/g1", token)).status).toBe(200)
    expect(
      (await call(env, "/api/online/lobbies/g1", token, { method: "DELETE" }))
        .status,
    ).toBe(200)
    expect(
      (
        await call(env, "/api/online/socket-ticket", token, {
          method: "POST",
          body: '{"gameId":"g1"}',
        })
      ).status,
    ).toBe(201)
    // Eigenaarschapscontroles blijven in het Durable Object.
    expect(lobbyStub.deleteLobby).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ uid: OTHER }),
    )
  })

  test("niet ingelogd en ongeldige tokens worden geweigerd op alle multiplayerroutes", async () => {
    for (const token of [null, "garbage"]) {
      expect((await call(env, "/api/online/lobbies", token)).status).toBe(401)
      expect(
        (
          await call(env, "/api/online/lobbies", token, {
            method: "POST",
            body: createLobbyBody,
          })
        ).status,
      ).toBe(401)
      expect(
        (
          await call(env, "/api/online/lobbies/join", token, {
            method: "POST",
            body: '{"code":"ABCDEF"}',
          })
        ).status,
      ).toBe(401)
    }
    expect(lobbyStub.createLobby).not.toHaveBeenCalled()
    expect(lobbyStub.listPublicLobbies).not.toHaveBeenCalled()
  })

  test("een client-aangeleverde uid/header geeft geen creator-rechten", async () => {
    const response = await worker.fetch(
      new Request(
        `https://api.mtgbattlearena.nl/api/online/lobbies?uid=${OWNER}`,
        {
          method: "POST",
          body: createLobbyBody,
          headers: {
            Authorization: `Bearer uid:${OTHER}`,
            "X-Verified-Uid": OWNER,
            "Content-Type": "application/json",
          },
        },
      ),
      env,
    )
    expect(response.status).toBe(403)
  })

  test("access-endpoint rapporteert alleen de creator-hint", async () => {
    const read = async (token: string | null): Promise<unknown> =>
      (await call(env, "/api/online/access", token)).json()
    await expect(read(`uid:${OWNER}`)).resolves.toEqual({
      canCreateLobby: true,
      mode: "beta",
    })
    await expect(read(`uid:${OTHER}`)).resolves.toEqual({
      canCreateLobby: false,
      mode: "beta",
    })
    await expect(read(null)).resolves.toEqual({
      canCreateLobby: false,
      mode: "beta",
    })
  })

  const graphql = (
    token: string | null,
    name: string,
    variables: Record<string, unknown> = {},
  ) =>
    call(env, "/graphql", token, {
      method: "POST",
      body: JSON.stringify({
        operationName: name,
        variables,
        extensions: {
          persistedQuery: { version: 1, sha256Hash: hashOf(name) },
        },
      }),
    })

  test("GraphQL: createLobby alleen voor creator; lijst en join voor elke ingelogde gebruiker", async () => {
    const input = {
      input: {
        title: "T",
        format: "Commander",
        visibility: "public",
        maxPlayers: 4,
      },
    }
    const blocked = await graphql(`uid:${OTHER}`, "CreateLobby", input)
    await expect(blocked.json()).resolves.toMatchObject({
      errors: [{ extensions: { code: "LOBBY_CREATION_RESTRICTED" } }],
    })
    expect(lobbyStub.createLobby).not.toHaveBeenCalled()

    const allowed = await graphql(`uid:${OWNER}`, "CreateLobby", input)
    expect(JSON.stringify(await allowed.json())).not.toContain(
      "LOBBY_CREATION_RESTRICTED",
    )
    expect(lobbyStub.createLobby).toHaveBeenCalledTimes(1)

    await expect(
      (await graphql(`uid:${OTHER}`, "PublicLobbies")).json(),
    ).resolves.toEqual({ data: { publicLobbies: [] } })
    await expect(
      (await graphql(null, "PublicLobbies")).json(),
    ).resolves.toMatchObject({
      errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
    })
    const joined = await graphql(`uid:${OTHER}`, "JoinLobby", {
      input: { code: "ABCDEF", role: "player" },
    })
    expect(JSON.stringify(await joined.json())).not.toContain(
      "LOBBY_CREATION_RESTRICTED",
    )
    expect(lobbyStub.joinByCode).toHaveBeenCalled()
  })
})

describe("multiplayer-access", () => {
  test("fail-closed zonder identiteit en voor onbekende UID's", () => {
    const env = { APP_ENV: "production" }
    expect(canCreateLobby(null, env)).toBe(false)
    expect(canCreateLobby({ uid: "" }, env)).toBe(false)
    expect(canCreateLobby({ uid: OTHER }, env)).toBe(false)
    expect(canCreateLobby({ uid: OWNER }, env)).toBe(true)
  })

  test("allowlist bevat alleen de eigenaar", () => {
    expect(LOBBY_CREATOR_UIDS).toEqual([OWNER])
  })

  test("de testoverride werkt niet in een gedeployde omgeving", () => {
    const override = { LOBBY_CREATION_MODE: "public" }
    expect(
      resolveLobbyCreationMode({ ...override, APP_ENV: "production" }),
    ).toBe("beta")
    expect(resolveLobbyCreationMode({ ...override, APP_ENV: "staging" })).toBe(
      "beta",
    )
    expect(resolveLobbyCreationMode({ ...override, APP_ENV: "test" })).toBe(
      "public",
    )
  })
})
