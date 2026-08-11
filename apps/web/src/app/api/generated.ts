import * as Types from './graphqlTypes'
import { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
import { graphqlApi } from './graphqlApi';
export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
  private value: string;
  public __meta__?: Record<string, any> | undefined;

  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}

export const PublicLobbiesDocument = new TypedDocumentString(`
    query PublicLobbies {
  publicLobbies {
    id
    code
    title
    hostDisplayName
    format
    visibility
    status
    playerCount
    maxPlayers
    viewerRole
  }
}
    `);
export const LobbyDocument = new TypedDocumentString(`
    query Lobby($id: ID!) {
  lobby(id: $id) {
    lobby {
      code
      title
      hostDisplayName
      status
      maxPlayers
      viewerRole
    }
    participants {
      displayName
      role
      seatNumber
      isHost
      isViewer
      deckReady
      deckName
    }
  }
}
    `);
export const DeckFromUrlDocument = new TypedDocumentString(`
    query DeckFromUrl($url: String!, $sourceHash: String) {
  deckFromUrl(url: $url, sourceHash: $sourceHash) {
    cacheStatus
    deckId
    revisionId
    deck {
      source
      sourceId
      sourceUrl
      sourceHash
      name
      format
      importedAt
      cards {
        definitionId
        quantity
        isCommander
      }
      definitions {
        id
        name
        oracleId
        layout
        faces {
          name
          typeLine
          oracleText
        }
        imageRefs {
          resolver
          imageId
          faceIndex
          variant
        }
        oracleText
        typeLine
        manaValue
        token {
          kind
          name
          power
          toughness
          source
        }
      }
    }
  }
}
    `);
export const CreateLobbyDocument = new TypedDocumentString(`
    mutation CreateLobby($input: CreateLobbyInput!) {
  createLobby(input: $input) {
    id
    status
  }
}
    `);
export const JoinLobbyDocument = new TypedDocumentString(`
    mutation JoinLobby($input: JoinLobbyInput!) {
  joinLobby(input: $input) {
    gameId
    lobby {
      status
    }
  }
}
    `);
export const DeleteLobbyDocument = new TypedDocumentString(`
    mutation DeleteLobby($id: ID!) {
  deleteLobby(id: $id)
}
    `);
export const AbortGameDocument = new TypedDocumentString(`
    mutation AbortGame($gameId: ID!) {
  abortGame(gameId: $gameId)
}
    `);
export const RegisterDeckDocument = new TypedDocumentString(`
    mutation RegisterDeck($gameId: ID!, $deck: RegisterDeckInput!) {
  registerDeck(gameId: $gameId, deck: $deck)
}
    `);
export const StartGameDocument = new TypedDocumentString(`
    mutation StartGame($gameId: ID!) {
  startGame(gameId: $gameId)
}
    `);
export const CreateSocketTicketDocument = new TypedDocumentString(`
    mutation CreateSocketTicket($gameId: ID!) {
  createSocketTicket(gameId: $gameId) {
    ticket
  }
}
    `);

const injectedRtkApi = graphqlApi.injectEndpoints({
  endpoints: (build) => ({
    PublicLobbies: build.query<Types.PublicLobbiesQuery, Types.PublicLobbiesQueryVariables | void>({
      query: (variables) => ({ document: PublicLobbiesDocument as unknown as string, variables })
    }),
    Lobby: build.query<Types.LobbyQuery, Types.LobbyQueryVariables>({
      query: (variables) => ({ document: LobbyDocument as unknown as string, variables })
    }),
    DeckFromUrl: build.query<Types.DeckFromUrlQuery, Types.DeckFromUrlQueryVariables>({
      query: (variables) => ({ document: DeckFromUrlDocument as unknown as string, variables })
    }),
    CreateLobby: build.mutation<Types.CreateLobbyMutation, Types.CreateLobbyMutationVariables>({
      query: (variables) => ({ document: CreateLobbyDocument as unknown as string, variables })
    }),
    JoinLobby: build.mutation<Types.JoinLobbyMutation, Types.JoinLobbyMutationVariables>({
      query: (variables) => ({ document: JoinLobbyDocument as unknown as string, variables })
    }),
    DeleteLobby: build.mutation<Types.DeleteLobbyMutation, Types.DeleteLobbyMutationVariables>({
      query: (variables) => ({ document: DeleteLobbyDocument as unknown as string, variables })
    }),
    AbortGame: build.mutation<Types.AbortGameMutation, Types.AbortGameMutationVariables>({
      query: (variables) => ({ document: AbortGameDocument as unknown as string, variables })
    }),
    RegisterDeck: build.mutation<Types.RegisterDeckMutation, Types.RegisterDeckMutationVariables>({
      query: (variables) => ({ document: RegisterDeckDocument as unknown as string, variables })
    }),
    StartGame: build.mutation<Types.StartGameMutation, Types.StartGameMutationVariables>({
      query: (variables) => ({ document: StartGameDocument as unknown as string, variables })
    }),
    CreateSocketTicket: build.mutation<Types.CreateSocketTicketMutation, Types.CreateSocketTicketMutationVariables>({
      query: (variables) => ({ document: CreateSocketTicketDocument as unknown as string, variables })
    }),
  }),
});

export { injectedRtkApi as api };
export const { usePublicLobbiesQuery, useLazyPublicLobbiesQuery, useLobbyQuery, useLazyLobbyQuery, useDeckFromUrlQuery, useLazyDeckFromUrlQuery, useCreateLobbyMutation, useJoinLobbyMutation, useDeleteLobbyMutation, useAbortGameMutation, useRegisterDeckMutation, useStartGameMutation, useCreateSocketTicketMutation } = injectedRtkApi;

