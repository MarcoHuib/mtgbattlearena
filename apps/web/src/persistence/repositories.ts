import type {
  AssetMetadata,
  DeckSnapshot,
  OfflineBattlePackage,
  PersistedGame,
} from "@mtg/game-core/types"

export type PersistedGameSummary = {
  id: string
  title: string
  savedAt: string
}

export type GameRepository = {
  save(record: PersistedGame): Promise<void>
  get(id: string): Promise<PersistedGame | null>
  getLatest(): Promise<PersistedGame | null>
  list(): Promise<PersistedGameSummary[]>
  delete(id: string): Promise<void>
}

export type DeckSnapshotRepository = {
  save(deck: DeckSnapshot): Promise<void>
  get(id: string): Promise<DeckSnapshot | null>
  getMany(ids: readonly string[]): Promise<DeckSnapshot[]>
}

export type OfflinePackageRepository = {
  save(record: OfflineBattlePackage): Promise<void>
  get(id: string): Promise<OfflineBattlePackage | null>
  getForGame(gameId: string): Promise<OfflineBattlePackage | null>
}

export type AssetMetadataRepository = {
  save(record: AssetMetadata): Promise<void>
  get(assetKey: string): Promise<AssetMetadata | null>
}

export type PersistenceRepositories = {
  games: GameRepository
  decks: DeckSnapshotRepository
  offlinePackages: OfflinePackageRepository
  assets: AssetMetadataRepository
}
