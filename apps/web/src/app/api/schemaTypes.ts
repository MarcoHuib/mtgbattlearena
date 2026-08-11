export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  JSON: { input: unknown; output: unknown; }
};

export type CardFaceInput = {
  imageUrl?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  oracleText?: InputMaybe<Scalars['String']['input']>;
  typeLine?: InputMaybe<Scalars['String']['input']>;
};

export enum ConnectionRole {
  Player = 'player',
  Spectator = 'spectator'
}

export type CreateLobbyInput = {
  format: Scalars['String']['input'];
  maxPlayers?: Scalars['Int']['input'];
  title: Scalars['String']['input'];
  visibility: LobbyVisibility;
};

export type DeckCardInput = {
  definitionId: Scalars['ID']['input'];
  faces?: InputMaybe<Array<CardFaceInput>>;
  imageUrl?: InputMaybe<Scalars['String']['input']>;
  isCommander: Scalars['Boolean']['input'];
  name: Scalars['String']['input'];
  quantity: Scalars['Int']['input'];
  scryfallId?: InputMaybe<Scalars['String']['input']>;
  typeLine?: InputMaybe<Scalars['String']['input']>;
};

export type DeckTokenInput = {
  definitionId: Scalars['ID']['input'];
  imageUrl?: InputMaybe<Scalars['String']['input']>;
  kind: Scalars['String']['input'];
  name: Scalars['String']['input'];
  power?: InputMaybe<Scalars['Int']['input']>;
  scryfallId?: InputMaybe<Scalars['String']['input']>;
  toughness?: InputMaybe<Scalars['Int']['input']>;
  typeLine?: InputMaybe<Scalars['String']['input']>;
};

export type Health = {
  __typename?: 'Health';
  firebaseConfigured: Scalars['Boolean']['output'];
  status: Scalars['String']['output'];
};

export type JoinLobbyInput = {
  code: Scalars['String']['input'];
  role?: InputMaybe<ConnectionRole>;
};

export type JoinLobbyPayload = {
  __typename?: 'JoinLobbyPayload';
  gameId: Scalars['ID']['output'];
  lobby: Lobby;
  role: ConnectionRole;
};

export type Lobby = {
  __typename?: 'Lobby';
  code: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  format: Scalars['String']['output'];
  hostDisplayName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  maxPlayers: Scalars['Int']['output'];
  playerCount: Scalars['Int']['output'];
  status: LobbyStatus;
  title: Scalars['String']['output'];
  viewerRole?: Maybe<LobbyRole>;
  visibility: LobbyVisibility;
};

export type LobbyParticipant = {
  __typename?: 'LobbyParticipant';
  deckName?: Maybe<Scalars['String']['output']>;
  deckReady: Scalars['Boolean']['output'];
  displayName: Scalars['String']['output'];
  isHost: Scalars['Boolean']['output'];
  isViewer: Scalars['Boolean']['output'];
  role: ConnectionRole;
  seatNumber?: Maybe<Scalars['Int']['output']>;
};

export enum LobbyRole {
  Host = 'host',
  Player = 'player',
  Spectator = 'spectator'
}

export type LobbyRoom = {
  __typename?: 'LobbyRoom';
  lobby: Lobby;
  participants: Array<LobbyParticipant>;
};

export enum LobbyStatus {
  Active = 'active',
  Finished = 'finished',
  Starting = 'starting',
  Waiting = 'waiting'
}

export enum LobbyVisibility {
  InviteOnly = 'invite_only',
  Private = 'private',
  Public = 'public'
}

export type Mutation = {
  __typename?: 'Mutation';
  abortGame: Scalars['Boolean']['output'];
  createLobby: Lobby;
  createSocketTicket: SocketTicket;
  deleteLobby: Scalars['Boolean']['output'];
  joinLobby: JoinLobbyPayload;
  registerDeck: Scalars['Boolean']['output'];
  startGame: Scalars['Boolean']['output'];
};


export type MutationAbortGameArgs = {
  gameId: Scalars['ID']['input'];
};


export type MutationCreateLobbyArgs = {
  input: CreateLobbyInput;
};


export type MutationCreateSocketTicketArgs = {
  gameId: Scalars['ID']['input'];
};


export type MutationDeleteLobbyArgs = {
  id: Scalars['ID']['input'];
};


export type MutationJoinLobbyArgs = {
  input: JoinLobbyInput;
};


export type MutationRegisterDeckArgs = {
  deck: RegisterDeckInput;
  gameId: Scalars['ID']['input'];
};


export type MutationStartGameArgs = {
  gameId: Scalars['ID']['input'];
};

export type Query = {
  __typename?: 'Query';
  health: Health;
  lobby: LobbyRoom;
  personalGameSnapshot: Scalars['JSON']['output'];
  publicLobbies: Array<Lobby>;
};


export type QueryLobbyArgs = {
  id: Scalars['ID']['input'];
};


export type QueryPersonalGameSnapshotArgs = {
  gameId: Scalars['ID']['input'];
};

export type RegisterDeckInput = {
  cards: Array<DeckCardInput>;
  deckName: Scalars['String']['input'];
  deckSnapshotId: Scalars['ID']['input'];
  tokens?: InputMaybe<Array<DeckTokenInput>>;
};

export type SocketTicket = {
  __typename?: 'SocketTicket';
  expiresAt: Scalars['String']['output'];
  ticket: Scalars['String']['output'];
};
