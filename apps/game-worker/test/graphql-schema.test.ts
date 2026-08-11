import { createGraphQLYoga } from "../src/graphql/yoga"
import type { GraphQLContext } from "../src/graphql/context"
import type { Env, LobbyDurableObjectStub } from "../src/types"

const identity = { uid: "verified-user", anonymous: false }

const contextWith = (
  lobbyOverrides: Partial<LobbyDurableObjectStub> = {},
  snapshot: unknown = { type: "PERSONAL_SNAPSHOT", ownHand: [] },
): GraphQLContext => {
  const lobby = {
    listPublicLobbies: () => [],
    ...lobbyOverrides,
  } as LobbyDurableObjectStub
  return {
    request: new Request("https://api.example/graphql"),
    env: { FIREBASE_PROJECT_ID: "project" } as Env,
    identity,
    lobby,
    importDeck: vi.fn() as GraphQLContext["importDeck"],
    personalSnapshot: vi.fn(() =>
      Promise.resolve(snapshot),
    ) as GraphQLContext["personalSnapshot"],
    startGame: vi.fn() as GraphQLContext["startGame"],
    abortGame: vi.fn() as GraphQLContext["abortGame"],
  }
}

const execute = async (
  context: GraphQLContext,
  query: string,
  variables?: Record<string, unknown>,
) => {
  const response = await createGraphQLYoga(context).fetch(
    new Request("https://api.example/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    }),
  )
  return response.json() as Promise<{
    data?: Record<string, unknown>
    errors?: { extensions?: { code?: string } }[]
  }>
}

test("createLobby gebruikt de geverifieerde identiteit en bestaande DO-logica", async () => {
  const createLobby = vi.fn(() =>
    Promise.resolve({
      ok: true as const,
      value: {
        id: "game",
        code: "BATTLE",
        title: "Veilige lobby",
        hostDisplayName: "Player",
        format: "Commander",
        visibility: "public" as const,
        status: "waiting" as const,
        playerCount: 1,
        maxPlayers: 4,
        createdAt: "2026-08-11T12:00:00.000Z",
        viewerRole: "host" as const,
      },
    }),
  )
  const context = contextWith({ createLobby })
  const result = await execute(
    context,
    `mutation Create($input: CreateLobbyInput!) {
      createLobby(input: $input) { id title viewerRole }
    }`,
    {
      input: {
        title: "Veilige lobby",
        format: "Commander",
        visibility: "public",
        maxPlayers: 4,
      },
    },
  )

  expect(result.errors).toBeUndefined()
  expect(result.data).toEqual({
    createLobby: { id: "game", title: "Veilige lobby", viewerRole: "host" },
  })
  expect(createLobby).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Veilige lobby" }),
    identity,
  )
})

test("persoonlijke snapshot is exact de reeds gefilterde DO-view", async () => {
  const personalView = {
    type: "PERSONAL_SNAPSHOT",
    viewerPlayerId: "viewer",
    ownHand: [{ instanceId: "own-card" }],
    opponents: [{ playerId: "opponent", handCount: 7 }],
  }
  const context = contextWith({}, personalView)
  // Vitest replaces this context method with a standalone spy.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const personalSnapshot = context.personalSnapshot
  const result = await execute(
    context,
    'query Snapshot { personalGameSnapshot(gameId: "game") }',
  )

  expect(result.errors).toBeUndefined()
  expect(result.data?.personalGameSnapshot).toEqual(personalView)
  expect(JSON.stringify(result.data)).not.toContain("opponent-private-card")
  expect(personalSnapshot).toHaveBeenCalledWith("game", identity)
})

test("GraphQL accepteert geen speler-ID om een andere private view te kiezen", async () => {
  const context = contextWith()
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const personalSnapshot = context.personalSnapshot
  const result = await execute(
    context,
    `query ForbiddenView {
      personalGameSnapshot(gameId: "game", playerId: "opponent")
    }`,
  )
  expect(result.errors).toHaveLength(1)
  expect(personalSnapshot).not.toHaveBeenCalled()
})

test("GraphQL en Zod weigeren ongeldige lobby-invoer", async () => {
  const result = await execute(
    contextWith(),
    `mutation Invalid {
      createLobby(input: { title: "", format: "Commander", visibility: public, maxPlayers: 9 }) { id }
    }`,
  )
  expect(result.errors).toHaveLength(1)
  expect(result.errors?.[0]?.extensions?.code).toBe("VALIDATION_ERROR")
})

test("deckFromUrl retourneert uitsluitend het provider-neutrale importcontract", async () => {
  const context = contextWith()
  context.importDeck = vi.fn().mockResolvedValue({
    cacheStatus: "MISS",
    deckId: "00000000-0000-4000-8000-000000000042",
    deck: {
      source: "archidekt",
      sourceId: "42",
      sourceUrl: "https://archidekt.com/decks/42",
      sourceHash: "abc",
      name: "Deck",
      importedAt: "2026-01-01T00:00:00.000Z",
      cards: [{ definitionId: "card", quantity: 1, isCommander: false }],
      definitions: [
        { id: "card", name: "Card", faces: [{ name: "Card" }], imageRefs: [] },
      ],
    },
  })
  // Vitest replaces this context method with a standalone spy.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const importDeck = context.importDeck
  const result = await execute(
    context,
    `query { deckFromUrl(url: "https://archidekt.com/decks/42") { cacheStatus deckId deck { source sourceId sourceHash name cards { definitionId quantity isCommander } } } }`,
  )
  expect(result.errors).toBeUndefined()
  expect(result.data?.deckFromUrl).toMatchObject({
    cacheStatus: "MISS",
    deckId: "00000000-0000-4000-8000-000000000042",
    deck: { sourceId: "42", name: "Deck" },
  })
  expect(importDeck).toHaveBeenCalledWith(
    "https://archidekt.com/decks/42",
    undefined,
  )
  expect(JSON.stringify(result.data)).not.toContain("categories")
})
