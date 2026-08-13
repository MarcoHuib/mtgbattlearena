import { GraphQLError, GraphQLScalarType, Kind } from "graphql"
import { createSchema } from "graphql-yoga"
import { z } from "zod"
import type { GraphQLContext } from "./context"
import { domainResult, requireIdentity } from "./errors"

const createLobbyInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  format: z.string().trim().min(1).max(40),
  visibility: z.enum(["public", "private", "invite-only"]),
  maxPlayers: z.number().int().min(2).max(6),
})
const joinLobbyInputSchema = z.object({
  code: z.string().trim().min(4).max(12),
  role: z.enum(["player", "spectator"]).default("player"),
})

export const typeDefs = /* GraphQL */ `
  scalar JSON

  enum LobbyVisibility {
    public
    private
    invite_only
  }
  enum LobbyStatus {
    waiting
    starting
    active
    finished
  }
  enum LobbyRole {
    host
    player
    spectator
  }
  enum ConnectionRole {
    player
    spectator
  }
  enum DeckSource {
    archidekt
  }
  enum DeckCacheStatus {
    HIT
    MISS
    REFRESHED
  }
  type CloudDeckMetadata {
    deckKey: ID!
    provider: DeckSource!
    externalDeckKey: ID!
    sourceUrl: String!
    name: String!
    format: String
    commanderSummary: String
    thumbnailImageRef: JSON
    colorIdentity: [String!]
    cardCount: Int!
    createdAt: String!
    updatedAt: String!
  }

  type Health {
    status: String!
    firebaseConfigured: Boolean!
  }
  type Lobby {
    id: ID!
    code: String!
    title: String!
    hostDisplayName: String!
    format: String!
    visibility: LobbyVisibility!
    status: LobbyStatus!
    playerCount: Int!
    maxPlayers: Int!
    createdAt: String!
    viewerRole: LobbyRole
  }
  type LobbyParticipant {
    displayName: String!
    role: ConnectionRole!
    seatNumber: Int
    isHost: Boolean!
    isViewer: Boolean!
    deckReady: Boolean!
    deckName: String
  }
  type LobbyRoom {
    lobby: Lobby!
    participants: [LobbyParticipant!]!
  }
  type JoinLobbyPayload {
    lobby: Lobby!
    gameId: ID!
    role: ConnectionRole!
  }
  type SocketTicket {
    ticket: String!
    expiresAt: String!
  }
  type ImportedCardFace {
    name: String!
    typeLine: String
    oracleText: String
  }
  type ImportedImageRef {
    resolver: Int!
    imageId: ID!
    faceIndex: Int!
    variant: String!
  }
  type ImportedToken {
    kind: String!
    name: String!
    power: Int
    toughness: Int
    source: String
  }
  type ImportedCardDefinition {
    id: ID!
    name: String!
    oracleId: String
    layout: String
    faces: [ImportedCardFace!]!
    imageRefs: [ImportedImageRef!]!
    oracleText: String
    typeLine: String
    manaValue: Float
    token: ImportedToken
  }
  type ImportedDeckCard {
    definitionId: ID!
    quantity: Int!
    isCommander: Boolean!
  }
  type ImportedDeck {
    source: DeckSource!
    sourceId: ID!
    sourceUrl: String!
    name: String!
    format: String
    importedAt: String!
    cards: [ImportedDeckCard!]!
    definitions: [ImportedCardDefinition!]!
  }
  type ImportedDeckResult {
    cacheStatus: DeckCacheStatus!
    deckId: ID!
    revisionId: ID!
    deck: ImportedDeck!
  }

  input CreateLobbyInput {
    title: String!
    format: String!
    visibility: LobbyVisibility!
    maxPlayers: Int! = 4
  }
  input JoinLobbyInput {
    code: String!
    role: ConnectionRole = player
  }
  type Query {
    health: Health!
    publicLobbies: [Lobby!]!
    lobby(id: ID!): LobbyRoom!
    personalGameSnapshot(gameId: ID!): JSON!
    deckFromUrl(url: String!): ImportedDeckResult!
  }
  type Mutation {
    createLobby(input: CreateLobbyInput!): Lobby!
    joinLobby(input: JoinLobbyInput!): JoinLobbyPayload!
    deleteLobby(id: ID!): Boolean!
    abortGame(gameId: ID!): Boolean!
    registerDeck(gameId: ID!, deckKey: ID!): Boolean!
    startGame(gameId: ID!): Boolean!
    createSocketTicket(gameId: ID!): SocketTicket!
    createCloudDeck(url: String!): CloudDeckMetadata!
    updateCloudDeck(deckKey: ID!): CloudDeckMetadata!
    deleteCloudDeck(deckKey: ID!): Boolean!
  }
`

const mapVisibility = (value: string) =>
  value === "invite_only" ? "invite-only" : value

export const schema = createSchema<GraphQLContext>({
  typeDefs,
  resolvers: {
    JSON: new GraphQLScalarType({
      name: "JSON",
      serialize: value => value,
      parseValue: value => value,
      parseLiteral(node) {
        if (node.kind === Kind.STRING) return node.value
        throw new GraphQLError("JSON literals worden niet ondersteund.")
      },
    }),
    Lobby: {
      visibility: (lobby: { visibility: string }) =>
        lobby.visibility === "invite-only" ? "invite_only" : lobby.visibility,
    },
    Query: {
      health: (_root, _args, context) => ({
        status: "ok",
        firebaseConfigured: Boolean(context.env.FIREBASE_PROJECT_ID),
      }),
      publicLobbies: async (_root, _args, context) =>
        context.lobby.listPublicLobbies(context.identity?.uid),
      lobby: async (_root, args: { id: string }, context) =>
        domainResult(
          await context.lobby.getLobbyRoom(args.id, requireIdentity(context)),
        ),
      personalGameSnapshot: async (_root, args: { gameId: string }, context) =>
        context.personalSnapshot(args.gameId, requireIdentity(context)),
      deckFromUrl: async (_root, args: { url: string }, context) =>
        context.importDeck(args.url),
    },
    Mutation: {
      createLobby: async (
        _root,
        args: {
          input: {
            title: string
            format: string
            visibility: string
            maxPlayers: number
          }
        },
        context,
      ) => {
        const identity = requireIdentity(context)
        const input = createLobbyInputSchema.parse({
          ...args.input,
          visibility: mapVisibility(args.input.visibility),
        })
        return domainResult(await context.lobby.createLobby(input, identity))
      },
      joinLobby: async (
        _root,
        args: { input: { code: string; role?: "player" | "spectator" } },
        context,
      ) => {
        const identity = requireIdentity(context)
        const input = joinLobbyInputSchema.parse(args.input)
        return domainResult(
          await context.lobby.joinByCode(input.code, input.role, identity),
        )
      },
      deleteLobby: async (_root, args: { id: string }, context) => {
        domainResult(
          await context.lobby.deleteLobby(args.id, requireIdentity(context)),
        )
        return true
      },
      abortGame: async (_root, args: { gameId: string }, context) => {
        await context.abortGame(args.gameId, requireIdentity(context))
        return true
      },
      registerDeck: async (
        _root,
        args: { gameId: string; deckKey: string },
        context,
      ) => {
        await context.registerCloudDeck(
          args.gameId,
          args.deckKey,
          requireIdentity(context),
        )
        return true
      },
      startGame: async (_root, args: { gameId: string }, context) => {
        await context.startGame(args.gameId, requireIdentity(context))
        return true
      },
      createSocketTicket: async (_root, args: { gameId: string }, context) =>
        domainResult(
          await context.lobby.issueSocketTicket(
            args.gameId,
            requireIdentity(context),
          ),
        ),
      createCloudDeck: (_root, args: { url: string }, context) =>
        context.createCloudDeck(args.url, requireIdentity(context)),
      updateCloudDeck: (_root, args: { deckKey: string }, context) =>
        context.updateCloudDeck(args.deckKey, requireIdentity(context)),
      deleteCloudDeck: async (_root, args: { deckKey: string }, context) => {
        await context.deleteCloudDeck(args.deckKey, requireIdentity(context))
        return true
      },
    },
  },
})
