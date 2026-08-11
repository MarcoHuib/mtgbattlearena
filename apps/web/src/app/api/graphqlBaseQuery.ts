import type { BaseQueryFn } from "@reduxjs/toolkit/query"
import { getAppCheckToken } from "../../firebaseAppCheck"
import { runtimeConfig } from "../../runtimeConfig"
import { persistedOperationIds } from "./persistedOperationIds.generated"

export type GraphQLRequest = {
  document: string
  variables?: unknown
}

export type GraphQLApiErrorStatus =
  | number
  | "GRAPHQL_ERROR"
  | "NETWORK_ERROR"
  | "AUTH_ERROR"
  | "APP_CHECK_ERROR"
  | "MALFORMED_RESPONSE"

export type GraphQLRequestError = {
  status: GraphQLApiErrorStatus
  data: { code: string; message: string }
}

type AuthTokenProvider = () => Promise<string | null>
let authTokenProvider: AuthTokenProvider = () => Promise.resolve(null)
let configuredBaseUrl: string | null = null

const publicErrorCodes = new Set([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT",
  "RATE_LIMITED",
  "PERSISTED_OPERATION_REQUIRED",
  "PERSISTED_OPERATION_NOT_FOUND",
  "PERSISTED_OPERATION_MISMATCH",
  "UNSUPPORTED_DECK_PROVIDER",
  "INVALID_DECK_URL",
  "DECK_NOT_FOUND",
  "DECK_PROVIDER_UNAVAILABLE",
  "DECK_PROVIDER_RATE_LIMITED",
  "INVALID_DECK_DATA",
  "DECK_IMPORT_FAILED",
])

export const setGraphQLAuthTokenProvider = (provider: AuthTokenProvider) => {
  authTokenProvider = provider
}

export const setGraphQLBaseUrl = (baseUrl: string) => {
  configuredBaseUrl = baseUrl
}

const failure = (
  status: GraphQLApiErrorStatus,
  code: string,
  message: string,
): { error: GraphQLRequestError } => ({
  error: { status, data: { code, message } },
})

const operationNameFor = (document: string) =>
  /\b(?:query|mutation)\s+([_A-Za-z][_0-9A-Za-z]*)/.exec(document)?.[1]

const isPersistedClientEnvironment = () =>
  Boolean(
    runtimeConfig.appEnv &&
    !["development", "test", "local"].includes(runtimeConfig.appEnv),
  )

export const graphqlBaseQuery =
  (): BaseQueryFn<GraphQLRequest, unknown, GraphQLRequestError> =>
  async ({ document, variables }, api) => {
    const baseUrl = configuredBaseUrl ?? runtimeConfig.onlineApiUrl.trim()
    if (!baseUrl) {
      return failure(
        503,
        "NOT_CONFIGURED",
        "De online GraphQL-service is niet geconfigureerd.",
      )
    }

    let idToken: string | null
    try {
      idToken = await authTokenProvider()
    } catch {
      return failure(
        "AUTH_ERROR",
        "UNAUTHENTICATED",
        "Authenticatie kon niet worden voltooid.",
      )
    }

    let appCheckToken: string | null
    try {
      appCheckToken = await getAppCheckToken()
    } catch {
      return failure(
        "APP_CHECK_ERROR",
        "APP_CHECK_FAILED",
        "De app-integriteitscontrole kon niet worden voltooid.",
      )
    }

    const headers = new Headers({ "Content-Type": "application/json" })
    if (idToken) headers.set("Authorization", `Bearer ${idToken}`)
    if (appCheckToken) headers.set("X-Firebase-AppCheck", appCheckToken)

    const operationName = operationNameFor(document)
    const persistedHash =
      operationName && operationName in persistedOperationIds
        ? persistedOperationIds[
            operationName as keyof typeof persistedOperationIds
          ]
        : null
    const usePersistedOperation = isPersistedClientEnvironment()
    if (usePersistedOperation && !persistedHash) {
      return failure(
        "GRAPHQL_ERROR",
        "PERSISTED_OPERATION_NOT_FOUND",
        "Deze GraphQL-operatie is niet geregistreerd.",
      )
    }

    let response: Response
    try {
      response = await fetch(new URL("/graphql", baseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: usePersistedOperation ? undefined : document,
          variables,
          operationName,
          extensions: persistedHash
            ? { persistedQuery: { version: 1, sha256Hash: persistedHash } }
            : undefined,
        }),
        signal: api.signal,
      })
    } catch (caught) {
      return failure(
        "NETWORK_ERROR",
        caught instanceof DOMException && caught.name === "AbortError"
          ? "REQUEST_ABORTED"
          : "NETWORK_ERROR",
        caught instanceof DOMException && caught.name === "AbortError"
          ? "De GraphQL-request is geannuleerd."
          : "De online service is niet bereikbaar.",
      )
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return failure(
        response.ok ? "MALFORMED_RESPONSE" : response.status,
        response.ok ? "MALFORMED_RESPONSE" : "HTTP_ERROR",
        response.ok
          ? "De online service gaf een ongeldig antwoord."
          : "De online service weigerde de request.",
      )
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return failure(
        response.ok ? "MALFORMED_RESPONSE" : response.status,
        response.ok ? "MALFORMED_RESPONSE" : "HTTP_ERROR",
        response.ok
          ? "De online service gaf een ongeldig antwoord."
          : "De online service weigerde de request.",
      )
    }

    const result = payload as {
      data?: unknown
      errors?: unknown
    }
    if (result.errors !== undefined && !Array.isArray(result.errors)) {
      return failure(
        "MALFORMED_RESPONSE",
        "MALFORMED_RESPONSE",
        "De online service gaf een ongeldig antwoord.",
      )
    }
    const firstError = (
      result.errors as
        { message?: unknown; extensions?: { code?: unknown } }[] | undefined
    )?.[0]
    if (!response.ok || firstError) {
      const receivedCode = firstError?.extensions?.code
      const code =
        typeof receivedCode === "string" && publicErrorCodes.has(receivedCode)
          ? receivedCode
          : "GRAPHQL_ERROR"
      const message =
        code !== "GRAPHQL_ERROR" && typeof firstError?.message === "string"
          ? firstError.message
          : response.ok
            ? "De GraphQL-operatie kon niet worden verwerkt."
            : "De online service weigerde de request."
      return failure(
        response.ok ? "GRAPHQL_ERROR" : response.status,
        code,
        message,
      )
    }
    if (!("data" in result) || result.data === undefined) {
      return failure(
        "MALFORMED_RESPONSE",
        "MALFORMED_RESPONSE",
        "De online service gaf een ongeldig antwoord.",
      )
    }
    return { data: result.data }
  }
