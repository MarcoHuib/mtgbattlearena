export type PlayerId = string
export type GameMode = "offline" | "online"

export type Zone =
  "library" | "hand" | "battlefield" | "graveyard" | "exile" | "command"

export type BattlefieldPosition = {
  x: number
  y: number
  z: number
}

export type TurnPhase =
  "beginning" | "precombat-main" | "combat" | "postcombat-main" | "ending"

export type TokenKind =
  "creature" | "treasure" | "food" | "clue" | "copy" | "emblem" | "other"

export type TokenDefinition = {
  kind: TokenKind
  name: string
  power?: number
  toughness?: number
  source?: "deck" | "custom"
}

export type CardFaceDefinition = {
  name: string
  typeLine?: string
  oracleText?: string
  imageUrl?: string
}

export type CardImageRef = {
  assetKey: string
  faceIndex: number
  variant: "normal"
  url: string
}

export type CardDefinition = {
  id: string
  name: string
  scryfallId?: string
  oracleId?: string
  layout?: string
  faces: CardFaceDefinition[]
  imageRefs: CardImageRef[]
  oracleText?: string
  typeLine?: string
  manaValue?: number
  token?: TokenDefinition
}

export type CardInstance = {
  instanceId: string
  definitionId: string
  ownerId: PlayerId
  controllerId: PlayerId
  zone: Zone
  tapped: boolean
  faceDown: boolean
  activeFaceIndex: number
  counters: Record<string, number>
  isCommander?: boolean
  attachedTo?: string
  position?: BattlefieldPosition
}

export type DeckCard = {
  definitionId: string
  quantity: number
  isCommander: boolean
}

export type ImportedDeck = {
  source: "archidekt"
  sourceDeckId: string
  name: string
  importedAt: string
  cards: DeckCard[]
  definitions: CardDefinition[]
}

export type DeckSnapshot = ImportedDeck & {
  id: string
  schemaVersion: 1
}

export type PlayerZones = Record<Zone, string[]>

export type OptionalPlayerTracker = "energy" | "experience" | "rad"

export type PlayerTrackers = Record<OptionalPlayerTracker, number>

export type PlayerTrackerVisibility = Record<OptionalPlayerTracker, boolean>

export type PlayerState = {
  id: PlayerId
  name: string
  deckSnapshotId: string
  life: number
  poison: number
  trackers: PlayerTrackers
  visibleTrackers: PlayerTrackerVisibility
  citysBlessing: boolean
  disabled: boolean
  commanderTax: Record<string, number>
  commanderDamage: Record<string, number>
  zones: PlayerZones
}

export type OpeningHandState = {
  mulliganCount: number
  kept: boolean
}

export type CardGroup = {
  id: string
  playerId: PlayerId
  name?: string
  cardIds: string[]
  position: BattlefieldPosition
  collapsed: boolean
}

export type DayNightStatus = "none" | "day" | "night"

export type MatchStatus = {
  monarchPlayerId: PlayerId | null
  initiativePlayerId: PlayerId | null
  dayNight: DayNightStatus
}

export type GameState = {
  schemaVersion: 6
  id: string
  title: string
  createdAt: string
  updatedAt: string
  activePlayerId: PlayerId
  turnNumber: number
  phase: TurnPhase
  matchStatus: MatchStatus
  openingHands: Record<PlayerId, OpeningHandState>
  deckSnapshotIds: [string, string]
  players: Record<PlayerId, PlayerState>
  cardDefinitionsById: Record<string, CardDefinition>
  cardsById: Record<string, CardInstance>
  groupsById: Record<string, CardGroup>
}

export type GameHistoryState = {
  present: GameState | null
  past: GameState[]
  future: GameState[]
}

export type OfflineAssetStatus =
  "queued" | "downloading" | "complete" | "failed"

export type OfflineAssetRecord = {
  assetKey: string
  url: string
  status: OfflineAssetStatus
  bytes?: number
  error?: string
}

export type OfflineBattlePackage = {
  id: string
  schemaVersion: 1
  version: number
  title: string
  deckSnapshotIds: [string, string]
  currentGameId: string
  assetIds: string[]
  assets: Record<string, OfflineAssetRecord>
  status:
    "queued" | "downloading" | "paused" | "complete" | "failed" | "cancelled"
  totalAssets: number
  completedAssets: number
  failedAssets: number
  totalBytes?: number
  downloadedBytes: number
  persistentStorage: "granted" | "denied" | "unsupported"
  createdAt: string
  updatedAt: string
}

export type PersistedGame = {
  schemaVersion: 6
  game: GameState
  past: GameState[]
  future: GameState[]
  savedAt: string
}

export type AssetMetadata = {
  assetKey: string
  schemaVersion: 1
  url: string
  cacheKind: "automatic" | "offline-package"
  bytes?: number
  cachedAt: string
}
