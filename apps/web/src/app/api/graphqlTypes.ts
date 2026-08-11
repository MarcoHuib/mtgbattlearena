/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type * as Schema from './schemaTypes';

export type PublicLobbiesQueryVariables = Exact<{ [key: string]: never; }>;


export type PublicLobbiesQuery = { publicLobbies: Array<{ id: string, code: string, title: string, hostDisplayName: string, format: string, visibility: Schema.LobbyVisibility, status: Schema.LobbyStatus, playerCount: number, maxPlayers: number, viewerRole: Schema.LobbyRole | null }> };

export type LobbyQueryVariables = Exact<{
  id: string | number;
}>;


export type LobbyQuery = { lobby: { lobby: { code: string, title: string, hostDisplayName: string, status: Schema.LobbyStatus, maxPlayers: number, viewerRole: Schema.LobbyRole | null }, participants: Array<{ displayName: string, role: Schema.ConnectionRole, seatNumber: number | null, isHost: boolean, isViewer: boolean, deckReady: boolean, deckName: string | null }> } };

export type CreateLobbyMutationVariables = Exact<{
  input: Schema.CreateLobbyInput;
}>;


export type CreateLobbyMutation = { createLobby: { id: string, status: Schema.LobbyStatus } };

export type JoinLobbyMutationVariables = Exact<{
  input: Schema.JoinLobbyInput;
}>;


export type JoinLobbyMutation = { joinLobby: { gameId: string, lobby: { status: Schema.LobbyStatus } } };

export type DeleteLobbyMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteLobbyMutation = { deleteLobby: boolean };

export type AbortGameMutationVariables = Exact<{
  gameId: string | number;
}>;


export type AbortGameMutation = { abortGame: boolean };

export type RegisterDeckMutationVariables = Exact<{
  gameId: string | number;
  deck: Schema.RegisterDeckInput;
}>;


export type RegisterDeckMutation = { registerDeck: boolean };

export type StartGameMutationVariables = Exact<{
  gameId: string | number;
}>;


export type StartGameMutation = { startGame: boolean };

export type CreateSocketTicketMutationVariables = Exact<{
  gameId: string | number;
}>;


export type CreateSocketTicketMutation = { createSocketTicket: { ticket: string } };
