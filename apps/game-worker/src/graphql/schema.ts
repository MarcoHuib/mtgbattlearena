import { GraphQLError, GraphQLScalarType, Kind } from "graphql"
import { createSchema } from "graphql-yoga"
import { z } from "zod"
import {
  onlineDeckSubmissionSchema,
  type OnlineDeckSubmission,
} from "@mtg/game-protocol"
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
  input CardFaceInput {
    name: String!
    typeLine: String
    oracleText: String
    imageUrl: String
  }
  input DeckCardInput {
    definitionId: ID!
    name: String!
    typeLine: String
    imageUrl: String
    scryfallId: String
    faces: [CardFaceInput!]
    quantity: Int!
    isCommander: Boolean!
  }
  input DeckTokenInput {
    definitionId: ID!
    name: String!
    typeLine: String
    imageUrl: String
    scryfallId: String
    kind: String!
    power: Int
    toughness: Int
  }
  input RegisterDeckInput {
    deckSnapshotId: ID!
    deckName: String!
    cards: [DeckCardInput!]!
    tokens: [DeckTokenInput!] = []
  }

  type Query {
    health: Health!
    publicLobbies: [Lobby!]!
    lobby(id: ID!): LobbyRoom!
    personalGameSnapshot(gameId: ID!): JSON!
  }
  type Mutation {
    createLobby(input: CreateLobbyInput!): Lobby!
    joinLobby(input: JoinLobbyInput!): JoinLobbyPayload!
    deleteLobby(id: ID!): Boolean!
    abortGame(gameId: ID!): Boolean!
    registerDeck(gameId: ID!, deck: RegisterDeckInput!): Boolean!
    startGame(gameId: ID!): Boolean!
    createSocketTicket(gameId: ID!): SocketTicket!
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
        args: { gameId: string; deck: OnlineDeckSubmission },
        context,
      ) => {
        const deck = onlineDeckSubmissionSchema.parse(args.deck)
        domainResult(
          await context.lobby.registerDeck(
            args.gameId,
            requireIdentity(context),
            deck,
          ),
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
    },
  },
})
