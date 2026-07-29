import { z } from "zod"
import { parseGameCommand } from "@mtg/game-protocol"
import { FirebaseTokenVerifier, readBearerToken } from "./auth"
import { GameDurableObject } from "./game-durable-object"
import { onlineGameSubmissionSchema } from "./game-server-adapter"
import { LobbyDurableObject } from "./lobby-durable-object"
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

const routeRequest = async (request: Request, env: Env) => {
  const url = new URL(request.url)
  const lobby = env.LOBBY.getByName("global")

  if (request.method === "GET" && url.pathname === "/api/online/health") {
    return json({
      status: "ok",
      firebaseConfigured: Boolean(env.FIREBASE_PROJECT_ID),
    })
  }

  if (request.method === "GET" && url.pathname === "/api/online/lobbies") {
    return json(await lobby.listPublicLobbies(), 200, {
      "Cache-Control": "public, max-age=5",
    })
  }

  if (request.method === "POST" && url.pathname === "/api/online/lobbies") {
    const identity = await authenticate(request, env)
    const input = createLobbySchema.parse(await readJson(request))
    return resultResponse(await lobby.createLobby(input, identity), 201)
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/online/lobbies/join"
  ) {
    const identity = await authenticate(request, env)
    const input = joinLobbySchema.parse(await readJson(request))
    return resultResponse(
      await lobby.joinByCode(input.code, input.role, identity),
    )
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/online/socket-ticket"
  ) {
    const identity = await authenticate(request, env)
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

  const gameRoute =
    /^\/api\/online\/games\/([^/]+)\/(commands|snapshot|initialize)$/.exec(
      url.pathname,
    )
  if (gameRoute?.[1] && gameRoute[2]) {
    const identity = await authenticate(request, env)
    const gameId = decodeURIComponent(gameRoute[1])
    const sessionResult = await findSession(env, gameId, identity)
    if (!sessionResult.ok) return resultResponse(sessionResult)
    const session = sessionResult.value
    const game = env.GAMES.getByName(gameId)

    if (gameRoute[2] === "initialize" && request.method === "POST") {
      const body = await readJson(request, 512_000)
      const submission = onlineGameSubmissionSchema.parse(
        typeof body === "object" && body !== null ? { ...body, gameId } : body,
      )
      const prepared = await lobby.prepareGame(gameId, identity, submission)
      if (!prepared.ok) return resultResponse(prepared)
      const initialized = await game.initializeGame(
        prepared.value.seed,
        prepared.value.session,
      )
      if (initialized.ok && initialized.value.type === "PERSONAL_SNAPSHOT") {
        await lobby.markGameActive(gameId, identity)
      }
      return gameResultResponse(initialized, 201)
    }

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

const withCors = (response: Response, request: Request, env: Env) => {
  const headers = new Headers(response.headers)
  const origin = request.headers.get("Origin")
  if (origin && env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN) {
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
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
