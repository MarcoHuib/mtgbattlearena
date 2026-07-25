import Dexie, { type EntityTable } from "dexie"
import type {
  AssetMetadata,
  DeckSnapshot,
  OfflineBattlePackage,
  PersistedGame,
} from "../game-core/types"
import type {
  AssetMetadataRepository,
  DeckSnapshotRepository,
  GameRepository,
  OfflinePackageRepository,
  PersistenceRepositories,
} from "./repositories"

type StoredGame = PersistedGame & { id: string; title: string }

class BattleDatabase extends Dexie {
  games!: EntityTable<StoredGame, "id">
  decks!: EntityTable<DeckSnapshot, "id">
  offlinePackages!: EntityTable<OfflineBattlePackage, "id">
  assets!: EntityTable<AssetMetadata, "assetKey">

  constructor() {
    super("mtg-battle-mode")
    this.version(1).stores({
      games: "id, savedAt",
      decks: "id, sourceDeckId, importedAt",
      offlinePackages: "id, currentGameId, updatedAt",
      assets: "assetKey, cacheKind, cachedAt",
    })
  }
}

const createDexieRepositories = (): PersistenceRepositories => {
  const database = new BattleDatabase()

  const games: GameRepository = {
    async save(record) {
      await database.games.put({
        ...record,
        id: record.game.id,
        title: record.game.title,
      })
    },
    async get(id) {
      return (await database.games.get(id)) ?? null
    },
    async getLatest() {
      const records = await database.games.toArray()
      return (
        [...records].sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0] ??
        null
      )
    },
    async list() {
      const records = await database.games.toArray()
      return [...records]
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
        .map(record => ({
          id: record.id,
          title: record.title,
          savedAt: record.savedAt,
        }))
    },
    async delete(id) {
      await database.games.delete(id)
    },
  }

  const decks: DeckSnapshotRepository = {
    async save(deck) {
      await database.decks.put(deck)
    },
    async get(id) {
      return (await database.decks.get(id)) ?? null
    },
    async getMany(ids) {
      const records = await database.decks.bulkGet([...ids])
      return records.filter(
        (record): record is DeckSnapshot => record !== undefined,
      )
    },
  }

  const offlinePackages: OfflinePackageRepository = {
    async save(record) {
      await database.offlinePackages.put(record)
    },
    async get(id) {
      return (await database.offlinePackages.get(id)) ?? null
    },
    async getForGame(gameId) {
      const records = await database.offlinePackages
        .where("currentGameId")
        .equals(gameId)
        .toArray()
      return (
        [...records].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt),
        )[0] ?? null
      )
    },
  }

  const assets: AssetMetadataRepository = {
    async save(record) {
      await database.assets.put(record)
    },
    async get(assetKey) {
      return (await database.assets.get(assetKey)) ?? null
    },
  }

  return { games, decks, offlinePackages, assets }
}

const createMemoryRepositories = (): PersistenceRepositories => {
  const gameRecords = new Map<string, PersistedGame>()
  const deckRecords = new Map<string, DeckSnapshot>()
  const packageRecords = new Map<string, OfflineBattlePackage>()
  const assetRecords = new Map<string, AssetMetadata>()

  return {
    games: {
      save(record) {
        gameRecords.set(record.game.id, structuredClone(record))
        return Promise.resolve()
      },
      get(id) {
        return Promise.resolve(structuredClone(gameRecords.get(id) ?? null))
      },
      getLatest() {
        const record = [...gameRecords.values()].sort((a, b) =>
          b.savedAt.localeCompare(a.savedAt),
        )[0]
        return Promise.resolve(structuredClone(record ?? null))
      },
      list() {
        return Promise.resolve(
          [...gameRecords.values()]
            .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
            .map(record => ({
              id: record.game.id,
              title: record.game.title,
              savedAt: record.savedAt,
            })),
        )
      },
      delete(id) {
        gameRecords.delete(id)
        return Promise.resolve()
      },
    },
    decks: {
      save(deck) {
        deckRecords.set(deck.id, structuredClone(deck))
        return Promise.resolve()
      },
      get(id) {
        return Promise.resolve(structuredClone(deckRecords.get(id) ?? null))
      },
      getMany(ids) {
        return Promise.resolve(
          ids.flatMap(id => {
            const deck = deckRecords.get(id)
            return deck ? [structuredClone(deck)] : []
          }),
        )
      },
    },
    offlinePackages: {
      save(record) {
        packageRecords.set(record.id, structuredClone(record))
        return Promise.resolve()
      },
      get(id) {
        return Promise.resolve(structuredClone(packageRecords.get(id) ?? null))
      },
      getForGame(gameId) {
        const record = [...packageRecords.values()]
          .filter(item => item.currentGameId === gameId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
        return Promise.resolve(structuredClone(record ?? null))
      },
    },
    assets: {
      save(record) {
        assetRecords.set(record.assetKey, structuredClone(record))
        return Promise.resolve()
      },
      get(assetKey) {
        return Promise.resolve(
          structuredClone(assetRecords.get(assetKey) ?? null),
        )
      },
    },
  }
}

export const createRepositories = (): PersistenceRepositories =>
  typeof indexedDB === "undefined"
    ? createMemoryRepositories()
    : createDexieRepositories()

export const repositories = createRepositories()
