import type { ValidationRule } from "graphql"
import { GraphQLError, Kind, OperationTypeNode } from "graphql"
import { persistedOperations } from "./persistedOperations.generated"

export const MAX_GRAPHQL_BODY_BYTES = 64 * 1024
export const MAX_GRAPHQL_ALIASES = 12
export const MAX_GRAPHQL_FIELDS = 120

type GraphQLRequestBody = {
  query?: unknown
  operationName?: unknown
  variables?: unknown
  extensions?: {
    persistedQuery?: {
      version?: unknown
      sha256Hash?: unknown
    }
  }
}

export const isClosedGraphQLEnvironment = (appEnvironment?: string) =>
  Boolean(
    appEnvironment &&
    !["development", "test", "local"].includes(appEnvironment),
  )

const requestError = (message: string, code: string) =>
  new GraphQLError(message, { extensions: { code } })

export const resolveGraphQLRequest = async (
  request: Request,
  env: { APP_ENV?: string },
): Promise<Request> => {
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) {
    throw requestError("GraphQL vereist application/json.", "INVALID_REQUEST")
  }
  const body = (await request.clone().json()) as unknown
  if (Array.isArray(body)) {
    throw requestError(
      "GraphQL batching is niet toegestaan.",
      "INVALID_REQUEST",
    )
  }
  if (!body || typeof body !== "object") {
    throw requestError("De GraphQL-request is ongeldig.", "INVALID_REQUEST")
  }

  const input = body as GraphQLRequestBody
  const hash = input.extensions?.persistedQuery?.sha256Hash
  const version = input.extensions?.persistedQuery?.version
  const persisted =
    typeof hash === "string" && hash in persistedOperations
      ? persistedOperations[hash as keyof typeof persistedOperations]
      : null
  const closed = isClosedGraphQLEnvironment(env.APP_ENV)

  if (closed && input.query !== undefined) {
    throw requestError(
      "Productie accepteert uitsluitend geregistreerde persisted operations.",
      "PERSISTED_OPERATION_REQUIRED",
    )
  }
  if (closed && (version !== 1 || typeof hash !== "string")) {
    throw requestError(
      "Een geldige persisted-operation-ID is vereist.",
      "PERSISTED_OPERATION_REQUIRED",
    )
  }
  if (hash !== undefined && !persisted) {
    throw requestError(
      "De persisted operation is niet geregistreerd.",
      "PERSISTED_OPERATION_NOT_FOUND",
    )
  }
  if (closed && !persisted) {
    throw requestError(
      "De persisted operation is niet geregistreerd.",
      "PERSISTED_OPERATION_NOT_FOUND",
    )
  }
  if (
    persisted &&
    input.operationName !== undefined &&
    input.operationName !== persisted.operationName
  ) {
    throw requestError(
      "De operationName hoort niet bij deze persisted operation.",
      "PERSISTED_OPERATION_MISMATCH",
    )
  }
  if (!persisted) return request

  const headers = new Headers(request.headers)
  const resolvedBody = JSON.stringify({
    query: persisted.document,
    operationName: persisted.operationName,
    variables: input.variables,
  })
  headers.delete("Content-Length")
  return new Request(request.url, {
    method: "POST",
    headers,
    body: resolvedBody,
  })
}

export const operationLimitsRule: ValidationRule = context => {
  let aliases = 0
  let fields = 0
  return {
    Field(node) {
      fields += 1
      if (node.alias) aliases += 1
      if (aliases > MAX_GRAPHQL_ALIASES) {
        context.reportError(new GraphQLError("Te veel GraphQL-aliassen."))
      }
      if (fields > MAX_GRAPHQL_FIELDS) {
        context.reportError(new GraphQLError("GraphQL-query is te complex."))
      }
    },
    OperationDefinition(node) {
      if (node.operation === OperationTypeNode.SUBSCRIPTION) {
        context.reportError(
          new GraphQLError("GraphQL subscriptions zijn niet beschikbaar."),
        )
      }
    },
    Document: {
      leave(node) {
        const operations = node.definitions.filter(
          definition => definition.kind === Kind.OPERATION_DEFINITION,
        )
        if (operations.length > 1) {
          context.reportError(
            new GraphQLError("GraphQL batching is niet toegestaan."),
          )
        }
      },
    },
  }
}
