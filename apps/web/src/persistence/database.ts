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
export type StoredDeckOwner = {
  key: string
  revisionId: string
  deckSourceId: string
  ownerId: string
}

export type LegacyStoredDeckOwner = Partial<StoredDeckOwner> & {
  key: string
  deckId?: string
  ownerId: string
}

export const deviceDeckOwnerId = "device"

const deckSourceIdentity = (deck: DeckSnapshot) =>
  deck.deckSourceId ??
  (deck.source === "local" ? deck.id : `${deck.source}:${deck.sourceId}`)

const deckOwnerKey = (deckSourceId: string, ownerId: string) =>
  `${encodeURIComponent(ownerId)}::${deckSourceId}`

export const selectLatestDeckOwnerRevisionsForMigration = (
  decks: readonly DeckSnapshot[],
  owners: readonly LegacyStoredDeckOwner[],
): StoredDeckOwner[] => {
  const byId = new Map(decks.map(deck => [deck.id, deck]))
  const selected = new Map<string, StoredDeckOwner>()
  for (const owner of owners) {
    const revisionId = owner.revisionId ?? owner.deckId
    const deck = revisionId ? byId.get(revisionId) : undefined
    if (!deck) continue
    const deckSourceId = deckSourceIdentity(deck)
    const key = deckOwnerKey(deckSourceId, owner.ownerId)
    const current = selected.get(key)
    const currentDeck = current ? byId.get(current.revisionId) : undefined
    if (
      currentDeck &&
      currentDeck.importedAt.localeCompare(deck.importedAt) >= 0
    )
      continue
    selected.set(key, {
      key,
      revisionId: deck.id,
      deckSourceId,
      ownerId: owner.ownerId,
    })
  }
  return [...selected.values()]
}

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
        await transaction.table<LegacyStoredDeckOwner>("deckOwners").bulkPut(
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
    this.version(4)
      .stores({
        games: "id, savedAt",
        decks: "id, [source+sourceId], importedAt",
        deckOwners: "key, deckId, ownerId, [ownerId+deckId]",
        offlinePackages: "id, currentGameId, updatedAt",
        assets: "assetKey, cacheKind, cachedAt",
      })
      .upgrade(async transaction => {
        const decks = await transaction.table<DeckSnapshot>("decks").toArray()
        const owners = transaction.table<LegacyStoredDeckOwner>("deckOwners")
        const games = await transaction.table<StoredGame>("games").toArray()
        const packages = await transaction
          .table<OfflineBattlePackage>("offlinePackages")
          .toArray()
        const groups = new Map<string, DeckSnapshot[]>()
        for (const deck of decks) {
          if (!deck.source || !deck.sourceId || deck.source === "local")
            continue
          const key = `${deck.source}\u0000${deck.sourceId}\u0000${deck.sourceHash}`
          groups.set(key, [...(groups.get(key) ?? []), deck])
        }
        for (const duplicates of groups.values()) {
          if (duplicates.length < 2) continue
          const [canonical, ...older] = [...duplicates].sort((left, right) =>
            right.importedAt.localeCompare(left.importedAt),
          )
          if (!canonical) continue
          for (const duplicate of older) {
            const duplicateOwners = await owners
              .where("deckId")
              .equals(duplicate.id)
              .toArray()
            await owners.bulkPut(
              duplicateOwners.map(owner => ({
                key: deckOwnerKey(canonical.id, owner.ownerId),
                deckId: canonical.id,
                ownerId: owner.ownerId,
              })),
            )
            await owners.where("deckId").equals(duplicate.id).delete()
            const referenced =
              games.some(record =>
                record.game.deckSnapshotIds.includes(duplicate.id),
              ) ||
              packages.some(record =>
                record.deckSnapshotIds.includes(duplicate.id),
              )
            if (!referenced)
              await transaction
                .table<DeckSnapshot>("decks")
                .delete(duplicate.id)
          }
        }
      })
    this.version(5)
      .stores({
        games: "id, savedAt",
        decks:
          "id, deckSourceId, [source+sourceId], [deckSourceId+sourceHash], importedAt",
        deckOwners:
          "key, deckId, deckSourceId, ownerId, [ownerId+deckSourceId]",
        offlinePackages: "id, currentGameId, updatedAt",
        assets: "assetKey, cacheKind, cachedAt",
      })
      .upgrade(async transaction => {
        const decks = transaction.table<DeckSnapshot>("decks")
        await decks.toCollection().modify(deck => {
          deck.deckSourceId = deckSourceIdentity(deck)
          deck.revisionId = deck.revisionId ?? deck.id
        })
        const records = await decks.toArray()
        const owners = transaction.table<LegacyStoredDeckOwner>("deckOwners")
        const existingOwners = await owners.toArray()
        await owners.clear()
        await owners.bulkPut(
          selectLatestDeckOwnerRevisionsForMigration(records, existingOwners),
        )
      })
    this.version(6)
      .stores({
        games: "id, savedAt",
        decks:
          "id, deckSourceId, [source+sourceId], [deckSourceId+sourceHash], importedAt",
        deckOwners:
          "key, revisionId, deckSourceId, ownerId, [ownerId+deckSourceId]",
        offlinePackages: "id, currentGameId, updatedAt",
        assets: "assetKey, cacheKind, cachedAt",
      })
      .upgrade(async transaction => {
        const decks = await transaction.table<DeckSnapshot>("decks").toArray()
        const owners = transaction.table<LegacyStoredDeckOwner>("deckOwners")
        const selected = selectLatestDeckOwnerRevisionsForMigration(
          decks,
          await owners.toArray(),
        )
        await owners.clear()
        await owners.bulkPut(selected)
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
        database.games,
        database.offlinePackages,
        async () => {
          const deckSourceId = deckSourceIdentity(deck)
          const revision = {
            ...deck,
            deckSourceId,
            revisionId: deck.revisionId ?? deck.id,
          }
          await database.decks.put(revision)
          await database.deckOwners.put({
            key: deckOwnerKey(deckSourceId, ownerId),
            revisionId: revision.id,
            deckSourceId,
            ownerId,
          })
          const previousRevisions = await database.decks
            .where("deckSourceId")
            .equals(deckSourceId)
            .and(candidate => candidate.id !== revision.id)
            .toArray()
          for (const previous of previousRevisions) {
            const referenced =
              (await database.games.toArray()).some(record =>
                record.game.deckSnapshotIds.includes(previous.id),
              ) ||
              (await database.offlinePackages.toArray()).some(record =>
                record.deckSnapshotIds.includes(previous.id),
              )
            const selected = await database.deckOwners
              .where("revisionId")
              .equals(previous.id)
              .count()
            if (!referenced && selected === 0)
              await database.decks.delete(previous.id)
          }
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
            ).map(owner => owner.revisionId),
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
        database.games,
        database.offlinePackages,
        async () => {
          if (ownerId) {
            const deck = await database.decks.get(id)
            if (deck) {
              const key = deckOwnerKey(deckSourceIdentity(deck), ownerId)
              const selection = await database.deckOwners.get(key)
              if (selection?.revisionId === id)
                await database.deckOwners.delete(key)
            }
          } else {
            await database.deckOwners.where("revisionId").equals(id).delete()
          }
          const remainingOwners = await database.deckOwners
            .where("revisionId")
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
  const deckOwners = new Map<string, StoredDeckOwner>()
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
        const sourceIdentity = deckSourceIdentity(deck)
        const ownerKey = deckOwnerKey(sourceIdentity, ownerId)
        const revision = {
          ...deck,
          deckSourceId: sourceIdentity,
          revisionId: deck.revisionId ?? deck.id,
        }
        for (const previous of deckRecords.values()) {
          if (
            previous.id === deck.id ||
            deckSourceIdentity(previous) !== sourceIdentity
          )
            continue
          const referenced =
            [...gameRecords.values()].some(record =>
              record.game.deckSnapshotIds.includes(previous.id),
            ) ||
            [...packageRecords.values()].some(record =>
              record.deckSnapshotIds.includes(previous.id),
            )
          const selected = [...deckOwners.values()].some(
            owner => owner.revisionId === previous.id,
          )
          if (!referenced && !selected) deckRecords.delete(previous.id)
        }
        deckRecords.set(revision.id, structuredClone(revision))
        deckOwners.set(ownerKey, {
          key: ownerKey,
          revisionId: revision.id,
          deckSourceId: sourceIdentity,
          ownerId,
        })
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
            .filter(
              deck =>
                !ownerId ||
                [...deckOwners.values()].some(
                  owner =>
                    owner.ownerId === ownerId && owner.revisionId === deck.id,
                ),
            )
            .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
            .map(deck => structuredClone(deck)),
        )
      },
      delete(id, ownerId) {
        if (!ownerId) {
          for (const [key, owner] of deckOwners)
            if (owner.revisionId === id) deckOwners.delete(key)
          deckRecords.delete(id)
          return Promise.resolve()
        }
        const deck = deckRecords.get(id)
        if (deck) {
          const key = deckOwnerKey(deckSourceIdentity(deck), ownerId)
          if (deckOwners.get(key)?.revisionId === id) deckOwners.delete(key)
        }
        const referenced =
          [...gameRecords.values()].some(record =>
            record.game.deckSnapshotIds.includes(id),
          ) ||
          [...packageRecords.values()].some(record =>
            record.deckSnapshotIds.includes(id),
          )
        const selected = [...deckOwners.values()].some(
          owner => owner.revisionId === id,
        )
        if (!selected && !referenced) deckRecords.delete(id)
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
