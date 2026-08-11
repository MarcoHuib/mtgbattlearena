import type { PersonalGameSnapshot, ServerEvent } from "@mtg/game-protocol"
import type { ImportedDeck } from "@mtg/game-core/types"
import type { Env, LobbyDurableObjectStub, VerifiedIdentity } from "../types"

export type GraphQLContext = {
  request: Request
  env: Env
  identity: VerifiedIdentity | null
  lobby: LobbyDurableObjectStub
  importDeck(
    url: string,
    sourceHash?: string,
  ): Promise<{
    cacheStatus: "HIT" | "MISS" | "REFRESHED"
    deck: ImportedDeck
  }>
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
