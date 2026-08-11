import { GraphQLError } from "graphql"
import { z } from "zod"
import type { GraphQLContext } from "./context"
import type { RpcResult, VerifiedIdentity } from "../types"

export const requireIdentity = (context: GraphQLContext): VerifiedIdentity => {
  if (!context.identity) {
    throw new GraphQLError("Log in om deze actie uit te voeren.", {
      extensions: { code: "UNAUTHENTICATED" },
    })
  }
  return context.identity
}

export const domainResult = <T>(result: RpcResult<T>): T => {
  if (result.ok) return result.value
  const code =
    result.status === 401
      ? "UNAUTHENTICATED"
      : result.status === 403
        ? "FORBIDDEN"
        : result.status === 404
          ? "NOT_FOUND"
          : result.status === 409
            ? "CONFLICT"
            : result.status === 429
              ? "RATE_LIMITED"
              : result.status === 400
                ? "VALIDATION_ERROR"
                : "INTERNAL_SERVER_ERROR"
  throw new GraphQLError(result.message, { extensions: { code } })
}

export const maskGraphQLError = (error: unknown) => {
  const outer = error as {
    message?: unknown
    extensions?: { code?: unknown }
    originalError?: {
      message?: unknown
      extensions?: { code?: unknown }
    }
  }
  const candidate = outer.originalError ?? outer
  if (candidate && typeof candidate === "object") {
    const code = candidate.extensions?.code
    if (
      typeof code === "string" &&
      [
        "UNAUTHENTICATED",
        "FORBIDDEN",
        "NOT_FOUND",
        "VALIDATION_ERROR",
        "CONFLICT",
        "RATE_LIMITED",
      ].includes(code)
    ) {
      return new GraphQLError(
        typeof candidate.message === "string"
          ? candidate.message
          : "De request kon niet worden verwerkt.",
        { extensions: { code } },
      )
    }
  }
  if (candidate instanceof z.ZodError) {
    return new GraphQLError("De invoer is ongeldig.", {
      extensions: { code: "VALIDATION_ERROR" },
    })
  }
  return new GraphQLError("De online service kon de request niet verwerken.", {
    extensions: { code: "INTERNAL_SERVER_ERROR" },
  })
}
