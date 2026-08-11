import { resolveGraphQLRequest } from "../src/graphql/security"
import { persistedOperations } from "../src/graphql/persistedOperations.generated"
import worker from "../src/index"
import type { Env } from "../src/types"

const publicLobbiesHash = Object.entries(persistedOperations).find(
  ([, operation]) => operation.operationName === "PublicLobbies",
)?.[0]
if (!publicLobbiesHash)
  throw new Error("PublicLobbies manifest entry ontbreekt.")

const request = (body: unknown) =>
  new Request("https://api.example/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

const persistedBody = (hash: string, operationName = "PublicLobbies") => ({
  operationName,
  extensions: { persistedQuery: { version: 1, sha256Hash: hash } },
})

test("bekende persisted operation wordt server-side naar het registerdocument vertaald", async () => {
  const resolved = await resolveGraphQLRequest(
    request(persistedBody(publicLobbiesHash)),
    { APP_ENV: "production" },
  )
  const body = (await resolved.json()) as {
    query: string
    operationName: string
  }
  expect(body.operationName).toBe("PublicLobbies")
  expect(body.query).toContain("query PublicLobbies")
  expect(body.query).toContain("publicLobbies")
})

test("bekende persisted operation wordt in productie uitgevoerd", async () => {
  const response = await worker.fetch(
    request(persistedBody(publicLobbiesHash)),
    {
      APP_ENV: "production",
      APP_CHECK_ENFORCEMENT: "off",
      LOBBY: {
        getByName: () => ({ listPublicLobbies: () => [] }),
      },
    } as unknown as Env,
  )
  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toEqual({
    data: { publicLobbies: [] },
  })
})

test("onbekende persisted-operation-hash faalt gesloten", async () => {
  await expect(
    resolveGraphQLRequest(request(persistedBody("0".repeat(64))), {
      APP_ENV: "production",
    }),
  ).rejects.toMatchObject({
    extensions: { code: "PERSISTED_OPERATION_NOT_FOUND" },
  })
})

test("gewijzigd document met een bekende naam en hash wordt geweigerd", async () => {
  await expect(
    resolveGraphQLRequest(
      request({
        ...persistedBody(publicLobbiesHash),
        query: 'query PublicLobbies { personalGameSnapshot(gameId: "ander") }',
      }),
      { APP_ENV: "production" },
    ),
  ).rejects.toMatchObject({
    extensions: { code: "PERSISTED_OPERATION_REQUIRED" },
  })
})

test("willekeurige productiedocumenten en dynamische registratie falen", async () => {
  await expect(
    resolveGraphQLRequest(
      request({
        operationName: "PublicLobbies",
        query: "query PublicLobbies { health { status } }",
      }),
      { APP_ENV: "production" },
    ),
  ).rejects.toMatchObject({
    extensions: { code: "PERSISTED_OPERATION_REQUIRED" },
  })
})

test("development accepteert normale GraphQL-documenten", async () => {
  const original = request({
    operationName: "AdHocDevelopmentQuery",
    query: "query AdHocDevelopmentQuery { health { status } }",
  })
  const resolved = await resolveGraphQLRequest(original, {
    APP_ENV: "development",
  })
  await expect(resolved.json()).resolves.toMatchObject({
    operationName: "AdHocDevelopmentQuery",
  })
})
