import type { BaseQueryApi } from "@reduxjs/toolkit/query"
import { setAppCheckTokenProvider } from "../../firebaseAppCheck"
import {
  graphqlBaseQuery,
  setGraphQLAuthTokenProvider,
  setGraphQLBaseUrl,
} from "./graphqlBaseQuery"
import { runtimeConfig } from "../../runtimeConfig"

const api = {
  signal: new AbortController().signal,
} as BaseQueryApi
const request = { document: "query PublicLobbies { publicLobbies { id } }" }
const execute = () => graphqlBaseQuery()(request, api, {})

beforeEach(() => {
  setGraphQLBaseUrl("https://api.example.test")
  setGraphQLAuthTokenProvider(() => Promise.resolve("firebase-token"))
  setAppCheckTokenProvider({
    getToken: () => Promise.resolve("app-check-token"),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  setAppCheckTokenProvider({ getToken: () => Promise.resolve(null) })
  runtimeConfig.appEnv = ""
})

test("productie verstuurt uitsluitend de geregistreerde hash", async () => {
  runtimeConfig.appEnv = "production"
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ data: { publicLobbies: [] } }))
  await execute()
  const requestBody = fetchMock.mock.calls[0]?.[1]?.body
  expect(typeof requestBody).toBe("string")
  const body = JSON.parse(requestBody as string) as {
    query?: string
    extensions?: { persistedQuery?: { sha256Hash?: string } }
  }
  expect(body.query).toBeUndefined()
  expect(body.extensions?.persistedQuery?.sha256Hash).toMatch(/^[a-f0-9]{64}$/)
})

test("retourne succesvolle GraphQL-data", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ data: { publicLobbies: [] } }),
  )
  await expect(execute()).resolves.toEqual({
    data: { publicLobbies: [] },
  })
})

test("maakt van HTTP-fouten een getypeerde RTK Query-fout", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json(
      {
        errors: [
          { message: "Geen toegang.", extensions: { code: "FORBIDDEN" } },
        ],
      },
      { status: 403 },
    ),
  )
  await expect(execute()).resolves.toEqual({
    error: {
      status: 403,
      data: { code: "FORBIDDEN", message: "Geen toegang." },
    },
  })
})

test("behandelt HTTP 200 met GraphQL-errors niet als succes", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      data: null,
      errors: [
        {
          message: "Versieconflict.",
          extensions: { code: "CONFLICT" },
        },
      ],
    }),
  )
  await expect(execute()).resolves.toEqual({
    error: {
      status: "GRAPHQL_ERROR",
      data: { code: "CONFLICT", message: "Versieconflict." },
    },
  })
})

test("onderscheidt Auth- en App Check-tokenfouten", async () => {
  setGraphQLAuthTokenProvider(() =>
    Promise.reject(new Error("firebase intern detail")),
  )
  await expect(execute()).resolves.toEqual({
    error: {
      status: "AUTH_ERROR",
      data: {
        code: "UNAUTHENTICATED",
        message: "Authenticatie kon niet worden voltooid.",
      },
    },
  })

  setGraphQLAuthTokenProvider(() => Promise.resolve("firebase-token"))
  setAppCheckTokenProvider({
    getToken: () => Promise.reject(new Error("recaptcha intern detail")),
  })
  await expect(execute()).resolves.toEqual({
    error: {
      status: "APP_CHECK_ERROR",
      data: {
        code: "APP_CHECK_FAILED",
        message: "De app-integriteitscontrole kon niet worden voltooid.",
      },
    },
  })
})

test("propageert publieke codes maar maskeert interne foutdetails", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch")
  fetchMock.mockResolvedValueOnce(
    Response.json({
      errors: [
        {
          message: "Te veel requests.",
          extensions: { code: "RATE_LIMITED" },
        },
      ],
    }),
  )
  await expect(execute()).resolves.toMatchObject({
    error: { data: { code: "RATE_LIMITED", message: "Te veel requests." } },
  })

  fetchMock.mockResolvedValueOnce(
    Response.json({
      errors: [
        {
          message: "SQL statement and stack trace",
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        },
      ],
    }),
  )
  await expect(execute()).resolves.toEqual({
    error: {
      status: "GRAPHQL_ERROR",
      data: {
        code: "GRAPHQL_ERROR",
        message: "De GraphQL-operatie kon niet worden verwerkt.",
      },
    },
  })
})

test("onderscheidt netwerkfouten en malformed responses", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch")
  fetchMock.mockRejectedValueOnce(new Error("socket intern detail"))
  await expect(execute()).resolves.toMatchObject({
    error: {
      status: "NETWORK_ERROR",
      data: { code: "NETWORK_ERROR" },
    },
  })

  fetchMock.mockResolvedValueOnce(
    new Response("geen json", {
      headers: { "Content-Type": "text/plain" },
    }),
  )
  await expect(execute()).resolves.toMatchObject({
    error: {
      status: "MALFORMED_RESPONSE",
      data: { code: "MALFORMED_RESPONSE" },
    },
  })
})
