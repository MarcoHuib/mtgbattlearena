import { api as generatedApi } from "./generated"

export const remoteGraphqlApi = generatedApi.enhanceEndpoints({
  endpoints: {
    PublicLobbies: { providesTags: ["LobbyList"] },
    Lobby: {
      providesTags: (_result, _error, variables) => [
        { type: "Lobby", id: String(variables.id) },
      ],
    },
    CreateLobby: { invalidatesTags: ["LobbyList"] },
    JoinLobby: {
      invalidatesTags: result => [
        "LobbyList",
        ...(result
          ? [{ type: "Lobby" as const, id: result.joinLobby.gameId }]
          : []),
      ],
    },
    DeleteLobby: {
      invalidatesTags: (_result, _error, variables) => [
        "LobbyList",
        { type: "Lobby", id: String(variables.id) },
      ],
    },
    AbortGame: {
      invalidatesTags: (_result, _error, variables) => [
        "LobbyList",
        { type: "Lobby", id: String(variables.gameId) },
      ],
    },
    RegisterDeck: {
      invalidatesTags: (_result, _error, variables) => [
        { type: "Lobby", id: String(variables.gameId) },
      ],
    },
    StartGame: {
      invalidatesTags: (_result, _error, variables) => [
        "LobbyList",
        { type: "Lobby", id: String(variables.gameId) },
      ],
    },
  },
})

export const {
  usePublicLobbiesQuery,
  useLobbyQuery,
  useDeckFromUrlQuery,
  useCreateLobbyMutation,
  useJoinLobbyMutation,
  useDeleteLobbyMutation,
  useAbortGameMutation,
  useRegisterDeckMutation,
  useStartGameMutation,
  useCreateSocketTicketMutation,
} = remoteGraphqlApi
