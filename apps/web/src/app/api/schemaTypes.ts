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

export enum DeckCacheStatus {
  Hit = 'HIT',
  Miss = 'MISS',
  Refreshed = 'REFRESHED'
}

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

export enum DeckSource {
  Archidekt = 'archidekt'
}

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

export type ImportedCardDefinition = {
  __typename?: 'ImportedCardDefinition';
  faces: Array<ImportedCardFace>;
  id: Scalars['ID']['output'];
  imageRefs: Array<ImportedImageRef>;
  layout?: Maybe<Scalars['String']['output']>;
  manaValue?: Maybe<Scalars['Float']['output']>;
  name: Scalars['String']['output'];
  oracleId?: Maybe<Scalars['String']['output']>;
  oracleText?: Maybe<Scalars['String']['output']>;
  scryfallId?: Maybe<Scalars['String']['output']>;
  token?: Maybe<ImportedToken>;
  typeLine?: Maybe<Scalars['String']['output']>;
};

export type ImportedCardFace = {
  __typename?: 'ImportedCardFace';
  imageUrl?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  oracleText?: Maybe<Scalars['String']['output']>;
  typeLine?: Maybe<Scalars['String']['output']>;
};

export type ImportedDeck = {
  __typename?: 'ImportedDeck';
  cards: Array<ImportedDeckCard>;
  definitions: Array<ImportedCardDefinition>;
  format?: Maybe<Scalars['String']['output']>;
  importedAt: Scalars['String']['output'];
  name: Scalars['String']['output'];
  source: DeckSource;
  sourceHash: Scalars['String']['output'];
  sourceId: Scalars['ID']['output'];
  sourceUrl: Scalars['String']['output'];
};

export type ImportedDeckCard = {
  __typename?: 'ImportedDeckCard';
  definitionId: Scalars['ID']['output'];
  isCommander: Scalars['Boolean']['output'];
  quantity: Scalars['Int']['output'];
};

export type ImportedDeckResult = {
  __typename?: 'ImportedDeckResult';
  cacheStatus: DeckCacheStatus;
  deck: ImportedDeck;
  deckId: Scalars['ID']['output'];
};

export type ImportedImageRef = {
  __typename?: 'ImportedImageRef';
  assetKey: Scalars['String']['output'];
  faceIndex: Scalars['Int']['output'];
  url: Scalars['String']['output'];
  variant: Scalars['String']['output'];
};

export type ImportedToken = {
  __typename?: 'ImportedToken';
  kind: Scalars['String']['output'];
  name: Scalars['String']['output'];
  power?: Maybe<Scalars['Int']['output']>;
  source?: Maybe<Scalars['String']['output']>;
  toughness?: Maybe<Scalars['Int']['output']>;
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
  deckFromUrl: ImportedDeckResult;
  health: Health;
  lobby: LobbyRoom;
  personalGameSnapshot: Scalars['JSON']['output'];
  publicLobbies: Array<Lobby>;
};


export type QueryDeckFromUrlArgs = {
  sourceHash?: InputMaybe<Scalars['String']['input']>;
  url: Scalars['String']['input'];
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
