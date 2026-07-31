import { createContext, useContext, type PropsWithChildren } from "react"
import type {
  BattlefieldPosition,
  CardDefinition,
  CardGroup,
  GameState,
  OptionalPlayerTracker,
  PlayerId,
  Zone,
} from "@mtg/game-core/types"

export type BattleMove = {
  instanceId: string
  playerId: PlayerId
  zone: Zone
  position?: BattlefieldPosition
}

export type BattleRuntimeActions = {
  rollForFirstPlayer: (playerId: PlayerId) => void
  rollAllForFirstPlayer: () => void
  completeFirstPlayerRoll: () => void
  moveCards: (moves: BattleMove[]) => void
  moveCardInLibrary: (
    instanceId: string,
    playerId: PlayerId,
    position: "top" | "bottom",
  ) => void
  toggleTap: (instanceId: string) => void
  toggleSelectedTap: (instanceIds: string[]) => void
  setCounter: (instanceId: string, counter: string, value: number) => void
  switchFace: (instanceId: string) => void
  changeStackOrder: (instanceId: string, direction: "front" | "back") => void
  attach: (attachmentId: string, targetId: string) => void
  detach: (attachmentId: string) => void
  duplicateToken: (instanceId: string) => void
  createGroup: (playerId: PlayerId, cardIds: string[], name?: string) => void
  addToGroup: (groupId: string, cardIds: string[]) => void
  removeFromGroup: (groupId: string, cardIds: string[]) => void
  updateGroup: (
    groupId: string,
    changes: Pick<Partial<CardGroup>, "name" | "collapsed">,
  ) => void
  moveGroup: (groupId: string, position: BattlefieldPosition) => void
  dissolveGroup: (groupId: string) => void
  drawCards: (playerId: PlayerId, amount: number) => void
  millCards: (playerId: PlayerId, amount: number) => void
  shuffleLibrary: (playerId: PlayerId) => void
  revealLibrary: (playerId: PlayerId, amount: number) => void
  hideLibrary: (playerId: PlayerId) => void
  mulligan: (playerId: PlayerId) => void
  keepHand: (playerId: PlayerId, bottomCardIds: string[]) => void
  untapAll: (playerId: PlayerId) => void
  createToken: (
    playerId: PlayerId,
    definition: CardDefinition,
    position?: BattlefieldPosition,
  ) => void
  changeLife: (playerId: PlayerId, delta: number) => void
  changePoison: (playerId: PlayerId, delta: number) => void
  changeTracker: (
    playerId: PlayerId,
    tracker: OptionalPlayerTracker,
    delta: number,
  ) => void
  setTrackerVisibility: (
    playerId: PlayerId,
    tracker: OptionalPlayerTracker,
    visible: boolean,
  ) => void
  setCitysBlessing: (playerId: PlayerId, active: boolean) => void
  setDisabled: (playerId: PlayerId, disabled: boolean) => void
  changeCommanderTax: (
    playerId: PlayerId,
    commanderId: string,
    delta: number,
  ) => void
  changeCommanderDamage: (
    playerId: PlayerId,
    commanderId: string,
    delta: number,
  ) => void
  setMonarch: (playerId: PlayerId | null) => void
  setInitiative: (playerId: PlayerId | null) => void
  setDayNight: (status: GameState["matchStatus"]["dayNight"]) => void
  nextPhase: () => void
  nextTurn: () => void
}

export type BattleRuntime = {
  mode: "offline" | "online"
  game: GameState
  viewerPlayerId: PlayerId | null
  controllablePlayerIds: ReadonlySet<PlayerId>
  hiddenZoneCounts: Partial<Record<PlayerId, Partial<Record<Zone, number>>>>
  selectedCardIds: string[]
  setSelectedCardIds: (instanceIds: string[]) => void
  pending: boolean
  firstPlayerRollFlow: "individual" | "all"
  canCompleteFirstPlayerRoll: boolean
  actions: BattleRuntimeActions
}

const BattleRuntimeContext = createContext<BattleRuntime | null>(null)

export const BattleRuntimeProvider = ({
  runtime,
  children,
}: PropsWithChildren<{ runtime: BattleRuntime }>) => (
  <BattleRuntimeContext.Provider value={runtime}>
    {children}
  </BattleRuntimeContext.Provider>
)

export const useBattleRuntime = () => {
  const runtime = useContext(BattleRuntimeContext)
  if (!runtime) {
    throw new Error("Battlecomponent ontbreekt binnen BattleRuntimeProvider.")
  }
  return runtime
}

export const canControlPlayer = (runtime: BattleRuntime, playerId: PlayerId) =>
  !runtime.pending && runtime.controllablePlayerIds.has(playerId)

export const battlePlayerIds = (game: GameState): PlayerId[] =>
  Object.keys(game.players).filter(
    (playerId): playerId is PlayerId => game.players[playerId] !== undefined,
  )
