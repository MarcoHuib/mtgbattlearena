import type { PersonalGameSnapshot, ServerEvent } from "@mtg/game-protocol"
import type { CloudDeckMetadata, ImportedDeck } from "@mtg/game-core/types"
import type { Env, LobbyDurableObjectStub, VerifiedIdentity } from "../types"

export type GraphQLContext = {
  request: Request
  env: Env
  identity: VerifiedIdentity | null
  lobby: LobbyDurableObjectStub
  importDeck(url: string): Promise<{
    cacheStatus: "HIT" | "MISS" | "REFRESHED"
    deckId: string
    revisionId: string
    deck: ImportedDeck
  }>
  createCloudDeck(
    url: string,
    identity: VerifiedIdentity,
  ): Promise<CloudDeckMetadata>
  updateCloudDeck(
    deckKey: string,
    identity: VerifiedIdentity,
  ): Promise<CloudDeckMetadata>
  deleteCloudDeck(deckKey: string, identity: VerifiedIdentity): Promise<void>
  registerCloudDeck(
    gameId: string,
    deckKey: string,
    identity: VerifiedIdentity,
  ): Promise<void>
  personalSnapshot(
    gameId: string,
    identity: VerifiedIdentity,
  ): Promise<PersonalGameSnapshot | ServerEvent>
  startGame(
    gameId: string,
    identity: VerifiedIdentity,
  ): Promise<PersonalGameSnapshot | ServerEvent>
  abortGame(gameId: string, identity: VerifiedIdentity): Promise<void>
}
