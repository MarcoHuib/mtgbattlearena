import { z } from "zod"
import type { ImportedDeck } from "@mtg/game-core/types"
import {
  onlineDeckSubmissionSchema,
  parseGameCommand,
  type PersonalGameSnapshot,
  type ServerEvent,
} from "@mtg/game-protocol"
import { FirebaseTokenVerifier, readBearerToken } from "./auth"
import {
  APP_CHECK_HEADER,
  FirebaseAppCheckVerifier,
  parseAllowedAppIds,
} from "./app-check"
import { GameDurableObject } from "./game-durable-object"
import { LobbyDurableObject } from "./lobby-durable-object"
import { GraphQLError } from "graphql"
import { createGraphQLYoga } from "./graphql/yoga"
import { resolveGraphQLRequest } from "./graphql/security"
import type {
  Env,
  GameSession,
  GameSnapshotResult,
  RpcResult,
  VerifiedIdentity,
} from "./types"

export { GameDurableObject, LobbyDurableObject }

const createLobbySchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    format: z.string().trim().min(1).max(40),
    visibility: z.enum(["public", "private", "invite-only"]),
    maxPlayers: z.number().int().min(2).max(6).default(4),
  })
  .strict()

const joinLobbySchema = z
  .object({
    code: z.string().trim().min(4).max(12),
    role: z.enum(["player", "spectator"]).default("player"),
  })
  .strict()

const ticketRequestSchema = z
  .object({ gameId: z.string().min(1).max(120) })
  .strict()

let verifier: { projectId: string; instance: FirebaseTokenVerifier } | undefined
let appCheckVerifier:
  { configuration: string; instance: FirebaseAppCheckVerifier } | undefined

const getVerifier = (env: Env) => {
  if (!env.FIREBASE_PROJECT_ID) throw new Error("AUTH_NOT_CONFIGURED")
  if (verifier?.projectId !== env.FIREBASE_PROJECT_ID) {
    verifier = {
      projectId: env.FIREBASE_PROJECT_ID,
      instance: new FirebaseTokenVerifier(env.FIREBASE_PROJECT_ID),
    }
  }
  return verifier.instance
}

export type AppCheckEnforcementMode = "off" | "monitor" | "enforce"

export const readAppCheckEnforcementMode = (
  configured?: string,
): AppCheckEnforcementMode => {
  if (!configured) return "off"
  if (["off", "monitor", "enforce"].includes(configured)) {
    return configured as AppCheckEnforcementMode
  }
  return "enforce"
}

const getAppCheckVerifier = (env: Env) => {
  const projectNumber = env.FIREBASE_PROJECT_NUMBER?.trim()
  const allowedAppIds = parseAllowedAppIds(env.FIREBASE_ALLOWED_APP_IDS)
  if (!projectNumber || allowedAppIds.size === 0) {
    throw new Error("APP_CHECK_NOT_CONFIGURED")
  }
  const configuration = `${projectNumber}:${[...allowedAppIds].sort().join(",")}`
  if (appCheckVerifier?.configuration !== configuration) {
    appCheckVerifier = {
      configuration,
      instance: new FirebaseAppCheckVerifier(projectNumber, allowedAppIds),
    }
  }
  return appCheckVerifier.instance
}

const requireAppCheck = async (request: Request, env: Env) => {
  const mode = readAppCheckEnforcementMode(env.APP_CHECK_ENFORCEMENT)
  if (mode === "off") return
  const configuredEnvironment = env.APP_ENV?.trim()
  const result = await getAppCheckVerifier(env).verify(
    request.headers.get(APP_CHECK_HEADER),
  )
  console.log("Firebase App Check verification.", {
    event: result.valid ? "app_check_valid" : "app_check_invalid",
    failureReason: result.valid ? undefined : result.reason,
    environment: configuredEnvironment ?? "unknown",
    route: new URL(request.url).pathname,
    requestId: request.headers.get("cf-ray") ?? undefined,
    authPresent: request.headers.has("Authorization"),
    enforcementMode: mode,
  })
  if (!result.valid && mode === "enforce") {
    throw new Error("APP_CHECK_REQUIRED")
  }
}

const json = (body: unknown, status = 200, headers?: HeadersInit) => {
  const responseHeaders = new Headers(headers)
  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", "no-store")
  }
  return Response.json(body, { status, headers: responseHeaders })
}

const error = (status: number, code: string, message: string) =>
  json({ code, message }, status)

const readJson = async (request: Request, limit = 32_768): Promise<unknown> => {
  const length = Number(request.headers.get("Content-Length") ?? 0)
  if (length > limit) throw new Error("PAYLOAD_TOO_LARGE")
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > limit) {
    throw new Error("PAYLOAD_TOO_LARGE")
  }
  return JSON.parse(text) as unknown
}

const authenticate = async (
  request: Request,
  env: Env,
): Promise<VerifiedIdentity> => {
  const token = readBearerToken(request)
  try {
    return await getVerifier(env).verify(token)
  } catch (caught) {
    if (caught instanceof Error && caught.message === "AUTH_NOT_CONFIGURED") {
      throw caught
    }
    console.warn("Firebase ID-token validation failed.", {
      reason: caught instanceof Error ? caught.message : "UNKNOWN",
      projectId: env.FIREBASE_PROJECT_ID,
    })
    throw new Error("INVALID_TOKEN", { cause: caught })
  }
}

const resultResponse = <T>(
  result: RpcResult<T>,
  successStatus = 200,
): Response =>
  result.ok
    ? json(result.value, successStatus)
    : error(result.status, result.code, result.message)

const serverEventStatus = (event: {
  type: string
  error?: { code: string }
}) => {
  if (event.type !== "ERROR") return 200
  switch (event.error?.code) {
    case "FORBIDDEN":
      return 403
    case "NOT_READY":
    case "VERSION_CONFLICT":
      return 409
    case "INVALID_COMMAND":
      return 400
    default:
      return 500
  }
}

const gameResultResponse = (
  result: GameSnapshotResult,
  successStatus = 200,
) => {
  if (!result.ok) {
    return error(result.status, result.code, result.message)
  }
  return json(
    result.value,
    result.value.type === "ERROR"
      ? serverEventStatus(result.value)
      : successStatus,
  )
}

const internalSocketRequest = (request: Request, session: GameSession) => {
  const headers = new Headers()
  const upgrade = request.headers.get("Upgrade")
  if (upgrade) headers.set("Upgrade", upgrade)
  headers.set("X-Game-Id", session.gameId)
  headers.set("X-Verified-Uid", session.uid)
  headers.set("X-Connection-Role", session.role)
  headers.set("X-Is-Host", String(session.isHost))
  if (session.playerId) headers.set("X-Player-Id", session.playerId)
  return new Request("https://game.internal/socket", { headers })
}

const findSession = async (
  env: Env,
  gameId: string,
  identity: VerifiedIdentity,
): Promise<RpcResult<GameSession>> => {
  const session = await env.LOBBY.getByName("global").getSession(
    gameId,
    identity.uid,
  )
  if (!session) {
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      message: "Je bent geen deelnemer aan deze game.",
    }
  }
  return { ok: true, value: session }
}

const personalSnapshot = async (
  env: Env,
  gameId: string,
  identity: VerifiedIdentity,
) => {
  const session = resultValue(await findSession(env, gameId, identity))
  return gameSnapshotValue(
    await env.GAMES.getByName(gameId).getPersonalSnapshot(session),
  )
}

const startRegisteredGame = async (
  env: Env,
  gameId: string,
  identity: VerifiedIdentity,
) => {
  const lobby = env.LOBBY.getByName("global")
  const prepared = resultValue(
    await lobby.prepareRegisteredGame(gameId, identity),
  )
  let initialized: GameSnapshotResult
  try {
    initialized = await env.GAMES.getByName(gameId).initializeGame(
      prepared.seed,
      prepared.session,
    )
  } catch (caught) {
    await lobby.releaseGameStart(gameId, identity)
    throw caught
  }
  if (initialized.ok && initialized.value.type === "PERSONAL_SNAPSHOT") {
    await lobby.markGameActive(gameId, identity)
  } else {
    await lobby.releaseGameStart(gameId, identity)
  }
  return gameSnapshotValue(initialized)
}

const abortRegisteredGame = async (
  env: Env,
  gameId: string,
  identity: VerifiedIdentity,
) => {
  const lobby = env.LOBBY.getByName("global")
  const session = await lobby.getSession(gameId, identity.uid)
  if (!session?.isHost) {
    throw new GraphQLError(
      "Alleen de geverifieerde host kan de game afbreken.",
      { extensions: { code: "FORBIDDEN" } },
    )
  }
  resultValue(await env.GAMES.getByName(gameId).abortGame(session))
  resultValue(await lobby.markGameFinished(gameId, identity))
}

const resultValue = <T>(result: RpcResult<T>): T => {
  if (result.ok) return result.value
  throw new GraphQLError(result.message, {
    extensions: {
      code:
        result.status === 403
          ? "FORBIDDEN"
          : result.status === 404
            ? "NOT_FOUND"
            : result.status === 409
              ? "CONFLICT"
              : result.status === 429
                ? "RATE_LIMITED"
                : "VALIDATION_ERROR",
      httpStatus: result.status,
    },
  })
}

const gameSnapshotValue = (
  result: GameSnapshotResult,
): PersonalGameSnapshot | ServerEvent => {
  if (!result.ok) return resultValue<never>(result)
  if (result.value.type === "ERROR") {
    throw new GraphQLError(result.value.error.message, {
      extensions: { code: result.value.error.code },
    })
  }
  return result.value
}

export const importDeckThroughService = async (
  service: Env["IMPORT"],
  url: string,
  sourceHash: string | undefined,
  releaseVersion = "unknown",
) => {
  let response: Response
  try {
    response = await service.fetch(
      new Request("https://import.internal/internal/deck-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, sourceHash }),
      }),
    )
  } catch {
    console.error("Deck import service request failed.", {
      event: "deck_import_service_failed",
      code: "IMPORT_SERVICE_ERROR",
      releaseVersion,
    })
    throw new GraphQLError("Het deck kon niet veilig worden geïmporteerd.", {
      extensions: { code: "DECK_IMPORT_FAILED" },
    })
  }
  let body: {
    cacheStatus?: "HIT" | "MISS" | "REFRESHED"
    deck?: ImportedDeck
    error?: { code?: string; message?: string }
  }
  try {
    body = (await response.json()) as typeof body
  } catch {
    body = {}
  }
  if (!response.ok || !body.deck || !body.cacheStatus) {
    console.error("Deck import service rejected request.", {
      event: "deck_import_service_rejected",
      code: body.error?.code ?? "IMPORT_SERVICE_ERROR",
      importWorkerStatus: response.status,
      releaseVersion,
    })
    const publicProviderError = Boolean(
      response.status < 500 && body.error?.code && body.error.message,
    )
    throw new GraphQLError(
      publicProviderError
        ? (body.error?.message ?? "Het deck kon niet worden geïmporteerd.")
        : "Het deck kon niet veilig worden geïmporteerd.",
      {
        extensions: {
          code: publicProviderError
            ? (body.error?.code ?? "DECK_IMPORT_FAILED")
            : "DECK_IMPORT_FAILED",
        },
      },
    )
  }
  return { cacheStatus: body.cacheStatus, deck: body.deck }
}

const graphqlRequest = async (request: Request, env: Env) => {
  if (request.method !== "POST") {
    return error(405, "METHOD_NOT_ALLOWED", "Gebruik POST voor GraphQL.")
  }
  const length = Number(request.headers.get("Content-Length") ?? 0)
  if (length > 65_536) throw new Error("PAYLOAD_TOO_LARGE")
  const encodedBody = new TextEncoder().encode(await request.clone().text())
  if (encodedBody.byteLength > 65_536) throw new Error("PAYLOAD_TOO_LARGE")
  let resolvedRequest: Request
  try {
    resolvedRequest = await resolveGraphQLRequest(request, env)
  } catch (caught) {
    if (caught instanceof GraphQLError) {
      return json(
        {
          errors: [
            {
              message: caught.message,
              extensions: { code: caught.extensions.code },
            },
          ],
        },
        400,
      )
    }
    throw caught
  }
  try {
    await requireAppCheck(request, env)
  } catch (caught) {
    if (
      caught instanceof Error &&
      ["APP_CHECK_REQUIRED", "APP_CHECK_NOT_CONFIGURED"].includes(
        caught.message,
      )
    ) {
      return json(
        {
          errors: [
            {
              message: "De app-integriteit kon niet worden gevalideerd.",
              extensions: { code: "FORBIDDEN" },
            },
          ],
        },
        403,
      )
    }
    throw caught
  }
  let identity: VerifiedIdentity | null = null
  if (request.headers.has("Authorization")) {
    try {
      identity = await authenticate(request, env)
    } catch {
      return json(
        {
          errors: [
            {
              message: "Authenticatie kon niet worden gevalideerd.",
              extensions: { code: "UNAUTHENTICATED" },
            },
          ],
        },
        401,
      )
    }
  }
  const lobby = env.LOBBY.getByName("global")
  const importDeck = (url: string, sourceHash?: string) =>
    importDeckThroughService(
      env.IMPORT,
      url,
      sourceHash,
      env.RELEASE_VERSION,
    ).then(async result => ({
      ...result,
      ...(await lobby.resolveDeckRevision(result.deck)),
    }))
  const yoga = createGraphQLYoga({
    request: resolvedRequest,
    env,
    identity,
    lobby,
    importDeck,
    personalSnapshot: (gameId, verifiedIdentity) =>
      personalSnapshot(env, gameId, verifiedIdentity),
    startGame: (gameId, verifiedIdentity) =>
      startRegisteredGame(env, gameId, verifiedIdentity),
    abortGame: (gameId, verifiedIdentity) =>
      abortRegisteredGame(env, gameId, verifiedIdentity),
  })
  return yoga.fetch(resolvedRequest)
}

const routeRequest = async (request: Request, env: Env) => {
  const url = new URL(request.url)
  const isApiCustomDomain = url.hostname === "api.mtgbattlearena.nl"
  const isSocketCustomDomain = url.hostname === "ws.mtgbattlearena.nl"
  const isSocketRequest = url.pathname === "/api/online/socket"

  if (
    (isApiCustomDomain && isSocketRequest) ||
    (isSocketCustomDomain && !isSocketRequest)
  ) {
    return error(404, "NOT_FOUND", "Route niet gevonden.")
  }

  if (url.pathname.startsWith("/api/import/archidekt")) {
    // Card images are loaded by native <img> requests, which cannot attach a
    // custom App Check header. The image endpoint remains narrowly constrained
    // by its UUID/hash schema, upstream allowlist, response limit and cache.
    if (!url.pathname.startsWith("/api/import/archidekt/image/")) {
      await requireAppCheck(request, env)
    }
    return env.IMPORT.fetch(request)
  }

  if (request.method === "GET" && url.pathname === "/api/online/health") {
    return json({
      status: "ok",
      firebaseConfigured: Boolean(env.FIREBASE_PROJECT_ID),
    })
  }

  if (url.pathname === "/graphql") {
    return graphqlRequest(request, env)
  }

  const lobby = env.LOBBY.getByName("global")

  if (request.method === "GET" && url.pathname === "/api/online/lobbies") {
    const identity = request.headers.has("Authorization")
      ? await authenticate(request, env)
      : null
    await requireAppCheck(request, env)
    return json(
      await lobby.listPublicLobbies(identity?.uid),
      200,
      identity ? undefined : { "Cache-Control": "public, max-age=5" },
    )
  }

  if (request.method === "POST" && url.pathname === "/api/online/lobbies") {
    const identity = await authenticate(request, env)
    await requireAppCheck(request, env)
    const input = createLobbySchema.parse(await readJson(request))
    return resultResponse(await lobby.createLobby(input, identity), 201)
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/online/lobbies/join"
  ) {
    const identity = await authenticate(request, env)
    await requireAppCheck(request, env)
    const input = joinLobbySchema.parse(await readJson(request))
    return resultResponse(
      await lobby.joinByCode(input.code, input.role, identity),
    )
  }

  const lobbyActionRoute =
    /^\/api\/online\/lobbies\/([^/]+)\/(deck|start)$/.exec(url.pathname)
  if (lobbyActionRoute?.[1] && lobbyActionRoute[2]) {
    const identity = await authenticate(request, env)
    await requireAppCheck(request, env)
    const gameId = decodeURIComponent(lobbyActionRoute[1])
    if (lobbyActionRoute[2] === "deck" && request.method === "PUT") {
      const submission = onlineDeckSubmissionSchema.parse(
        await readJson(request, 512_000),
      )
      return resultResponse(
        await lobby.registerDeck(gameId, identity, submission),
      )
    }
    if (lobbyActionRoute[2] === "start" && request.method === "POST") {
      try {
        return json(await startRegisteredGame(env, gameId, identity), 201)
      } catch (caught) {
        if (
          caught instanceof GraphQLError &&
          typeof caught.extensions.httpStatus === "number"
        ) {
          return error(
            caught.extensions.httpStatus,
            String(caught.extensions.code),
            caught.message,
          )
        }
        throw caught
      }
    }
  }

  const abortGameRoute = /^\/api\/online\/lobbies\/([^/]+)\/abort$/.exec(
    url.pathname,
  )
  if (abortGameRoute?.[1] && request.method === "POST") {
    const identity = await authenticate(request, env)
    await requireAppCheck(request, env)
    const gameId = decodeURIComponent(abortGameRoute[1])
    try {
      await abortRegisteredGame(env, gameId, identity)
      return json(null)
    } catch (caught) {
      if (caught instanceof GraphQLError) {
        return error(403, String(caught.extensions.code), caught.message)
      }
      throw caught
    }
  }

  const lobbyRoomRoute = /^\/api\/online\/lobbies\/([^/]+)$/.exec(url.pathname)
  if (lobbyRoomRoute?.[1]) {
    const identity = await authenticate(request, env)
    await requireAppCheck(request, env)
    const gameId = decodeURIComponent(lobbyRoomRoute[1])
    if (request.method === "GET") {
      return resultResponse(await lobby.getLobbyRoom(gameId, identity))
    }
    if (request.method === "DELETE") {
      return resultResponse(await lobby.deleteLobby(gameId, identity))
    }
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/online/socket-ticket"
  ) {
    const identity = await authenticate(request, env)
    await requireAppCheck(request, env)
    const { gameId } = ticketRequestSchema.parse(await readJson(request))
    return resultResponse(await lobby.issueSocketTicket(gameId, identity), 201)
  }

  if (request.method === "GET" && url.pathname === "/api/online/socket") {
    const ticket = url.searchParams.get("ticket")
    if (!ticket) return error(401, "AUTH_REQUIRED", "Socket-ticket ontbreekt.")
    const session = await lobby.consumeSocketTicket(ticket)
    if (!session) {
      return error(
        401,
        "TICKET_EXPIRED",
        "Socket-ticket is verlopen of al gebruikt.",
      )
    }
    return env.GAMES.getByName(session.gameId).fetch(
      internalSocketRequest(request, session),
    )
  }

  const gameRoute = /^\/api\/online\/games\/([^/]+)\/(commands|snapshot)$/.exec(
    url.pathname,
  )
  if (gameRoute?.[1] && gameRoute[2]) {
    const identity = await authenticate(request, env)
    await requireAppCheck(request, env)
    const gameId = decodeURIComponent(gameRoute[1])
    const sessionResult = await findSession(env, gameId, identity)
    if (!sessionResult.ok) return resultResponse(sessionResult)
    const session = sessionResult.value
    const game = env.GAMES.getByName(gameId)

    if (gameRoute[2] === "snapshot" && request.method === "GET") {
      return gameResultResponse(await game.getPersonalSnapshot(session))
    }

    if (gameRoute[2] === "commands" && request.method === "POST") {
      const command = parseGameCommand(await readJson(request, 16_384))
      const result = await game.executeCommand(session, command)
      return json(result.event, serverEventStatus(result.event))
    }
  }

  return error(404, "NOT_FOUND", "Route niet gevonden.")
}

export const isOriginAllowed = (
  origin: string | null,
  configuredOrigins?: string,
) =>
  Boolean(
    origin &&
    configuredOrigins
      ?.split(",")
      .map(value => value.trim())
      .filter(Boolean)
      .includes(origin),
  )

const withCors = (response: Response, request: Request, env: Env) => {
  const headers = new Headers(response.headers)
  const origin = request.headers.get("Origin")
  if (origin && isOriginAllowed(origin, env.ALLOWED_ORIGIN)) {
    headers.set("Access-Control-Allow-Origin", origin)
    headers.set("Vary", "Origin")
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export default {
  async fetch(request: Request, env: Env) {
    if (request.method === "OPTIONS") {
      return withCors(
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Headers":
              "Authorization, Content-Type, X-Firebase-AppCheck",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          },
        }),
        request,
        env,
      )
    }
    try {
      const response = await routeRequest(request, env)
      if (
        request.method === "GET" &&
        new URL(request.url).pathname === "/api/online/socket"
      ) {
        return response
      }
      return withCors(response, request, env)
    } catch (caught) {
      if (caught instanceof z.ZodError || caught instanceof SyntaxError) {
        return withCors(
          error(400, "INVALID_REQUEST", "De request is ongeldig."),
          request,
          env,
        )
      }
      if (caught instanceof Error && caught.message === "AUTH_REQUIRED") {
        return withCors(
          error(401, "AUTH_REQUIRED", "Log in om deze actie uit te voeren."),
          request,
          env,
        )
      }
      if (caught instanceof Error && caught.message === "PAYLOAD_TOO_LARGE") {
        return withCors(
          error(413, "PAYLOAD_TOO_LARGE", "De request is te groot."),
          request,
          env,
        )
      }
      if (caught instanceof Error && caught.message === "AUTH_NOT_CONFIGURED") {
        return withCors(
          error(
            503,
            "AUTH_NOT_CONFIGURED",
            "Firebase-authenticatie is niet geconfigureerd.",
          ),
          request,
          env,
        )
      }
      if (caught instanceof Error && caught.message === "INVALID_TOKEN") {
        return withCors(
          error(
            401,
            "INVALID_TOKEN",
            "Authenticatie kon niet worden gevalideerd.",
          ),
          request,
          env,
        )
      }
      if (
        caught instanceof Error &&
        ["APP_CHECK_REQUIRED", "APP_CHECK_NOT_CONFIGURED"].includes(
          caught.message,
        )
      ) {
        return withCors(
          error(
            403,
            "APP_CHECK_REQUIRED",
            "De app-integriteit kon niet worden gevalideerd.",
          ),
          request,
          env,
        )
      }
      return withCors(
        error(
          500,
          "INTERNAL_ERROR",
          "De online service kon de request niet verwerken.",
        ),
        request,
        env,
      )
    }
  },
}
