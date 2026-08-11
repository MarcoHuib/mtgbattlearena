import Dexie, { type EntityTable } from "dexie"
import type {
  AssetMetadata,
  DeckSnapshot,
  OfflineBattlePackage,
  PersistedGame,
} from "@mtg/game-core/types"
import type {
  AssetMetadataRepository,
  DeckSnapshotRepository,
  GameRepository,
  OfflinePackageRepository,
  PersistenceRepositories,
} from "./repositories"

type StoredGame = PersistedGame & { id: string; title: string }
type StoredDeckOwner = {
  key: string
  deckId: string
  ownerId: string
}

export const deviceDeckOwnerId = "device"

const deckOwnerKey = (deckId: string, ownerId: string) =>
  `${encodeURIComponent(ownerId)}::${deckId}`

class BattleDatabase extends Dexie {
  games!: EntityTable<StoredGame, "id">
  decks!: EntityTable<DeckSnapshot, "id">
  deckOwners!: EntityTable<StoredDeckOwner, "key">
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
    this.version(2)
      .stores({
        games: "id, savedAt",
        decks: "id, sourceDeckId, importedAt",
        deckOwners: "key, deckId, ownerId, [ownerId+deckId]",
        offlinePackages: "id, currentGameId, updatedAt",
        assets: "assetKey, cacheKind, cachedAt",
      })
      .upgrade(async transaction => {
        const decks = await transaction.table<DeckSnapshot>("decks").toArray()
        await transaction.table<StoredDeckOwner>("deckOwners").bulkPut(
          decks.map(deck => ({
            key: deckOwnerKey(deck.id, deviceDeckOwnerId),
            deckId: deck.id,
            ownerId: deviceDeckOwnerId,
          })),
        )
      })
    this.version(3)
      .stores({
        games: "id, savedAt",
        decks: "id, sourceId, importedAt",
        deckOwners: "key, deckId, ownerId, [ownerId+deckId]",
        offlinePackages: "id, currentGameId, updatedAt",
        assets: "assetKey, cacheKind, cachedAt",
      })
      .upgrade(async transaction => {
        const table = transaction.table<
          DeckSnapshot & { sourceDeckId?: string }
        >("decks")
        await table.toCollection().modify(deck => {
          if (deck.sourceId) return
          const sourceId = deck.sourceDeckId ?? deck.id
          deck.sourceId = sourceId
          deck.sourceUrl = `https://archidekt.com/decks/${encodeURIComponent(sourceId)}`
          deck.sourceHash = `legacy-${deck.id}`
          delete deck.sourceDeckId
        })
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
    async save(deck, ownerId = deviceDeckOwnerId) {
      await database.transaction(
        "rw",
        database.decks,
        database.deckOwners,
        async () => {
          await database.decks.put(deck)
          await database.deckOwners.put({
            key: deckOwnerKey(deck.id, ownerId),
            deckId: deck.id,
            ownerId,
          })
        },
      )
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
    async list(ownerId) {
      const records = ownerId
        ? await database.decks.bulkGet(
            (
              await database.deckOwners
                .where("ownerId")
                .equals(ownerId)
                .toArray()
            ).map(owner => owner.deckId),
          )
        : await database.decks.toArray()
      return [...records]
        .sort((a, b) =>
          (b?.importedAt ?? "").localeCompare(a?.importedAt ?? ""),
        )
        .filter((record): record is DeckSnapshot => record !== undefined)
    },
    async delete(id, ownerId) {
      await database.transaction(
        "rw",
        database.decks,
        database.deckOwners,
        async () => {
          if (ownerId) {
            await database.deckOwners.delete(deckOwnerKey(id, ownerId))
          } else {
            await database.deckOwners.where("deckId").equals(id).delete()
          }
          const remainingOwners = await database.deckOwners
            .where("deckId")
            .equals(id)
            .count()
          if (remainingOwners > 0) return
          const games = await database.games.toArray()
          const packages = await database.offlinePackages.toArray()
          const referenced =
            games.some(record => record.game.deckSnapshotIds.includes(id)) ||
            packages.some(record => record.deckSnapshotIds.includes(id))
          if (!referenced) await database.decks.delete(id)
        },
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

export const createMemoryRepositories = (): PersistenceRepositories => {
  const gameRecords = new Map<string, PersistedGame>()
  const deckRecords = new Map<string, DeckSnapshot>()
  const deckOwners = new Map<string, Set<string>>()
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
      save(deck, ownerId = deviceDeckOwnerId) {
        deckRecords.set(deck.id, structuredClone(deck))
        const owners = deckOwners.get(deck.id) ?? new Set<string>()
        owners.add(ownerId)
        deckOwners.set(deck.id, owners)
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
      list(ownerId) {
        return Promise.resolve(
          [...deckRecords.values()]
            .filter(deck => !ownerId || deckOwners.get(deck.id)?.has(ownerId))
            .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
            .map(deck => structuredClone(deck)),
        )
      },
      delete(id, ownerId) {
        if (!ownerId) {
          deckOwners.delete(id)
          deckRecords.delete(id)
          return Promise.resolve()
        }
        const owners = deckOwners.get(id)
        owners?.delete(ownerId)
        const referenced =
          [...gameRecords.values()].some(record =>
            record.game.deckSnapshotIds.includes(id),
          ) ||
          [...packageRecords.values()].some(record =>
            record.deckSnapshotIds.includes(id),
          )
        if (!owners?.size) {
          deckOwners.delete(id)
          if (!referenced) deckRecords.delete(id)
        }
        return Promise.resolve()
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
