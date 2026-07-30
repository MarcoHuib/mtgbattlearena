import { useMemo } from "react"
import { useAppDispatch, useAppSelector } from "../../app/hooks"
import {
  addKnownToken,
  addToGroup,
  attach,
  changeDamage,
  changeLife,
  changePoison,
  changeStackOrder,
  changeTax,
  changeTracker,
  copyToken,
  createGroup,
  detach,
  dissolveGroup,
  drawCard,
  keepHand,
  mill,
  moveCardInLibrary,
  moveGameCards,
  moveGroup,
  mulliganHand,
  nextPhase,
  nextTurn,
  removeFromGroup,
  setCitysBlessing,
  setCounter,
  setDayNight,
  setDisabled,
  setInitiative,
  setMonarch,
  setTrackerVisibility,
  shufflePlayerLibrary,
  switchFace,
  toggleSelectedTap,
  toggleTap,
  untapAll,
  updateGroup,
} from "../game/gameSlice"
import { clearCardSelection, setCardSelection } from "../ui/uiSlice"
import { battlePlayerIds, type BattleRuntime } from "./BattleRuntime"

const randomSeed = () => {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return values[0] ?? Date.now()
}

export const useOfflineBattleRuntime = (): BattleRuntime | null => {
  const dispatch = useAppDispatch()
  const game = useAppSelector(state => state.game.present)
  const selectedCardIds = useAppSelector(state => state.ui.selectedCardIds)

  return useMemo(() => {
    if (!game) return null
    return {
      mode: "offline",
      game,
      viewerPlayerId: "player-1",
      controllablePlayerIds: new Set(battlePlayerIds(game)),
      hiddenZoneCounts: {},
      selectedCardIds,
      setSelectedCardIds: instanceIds => {
        if (instanceIds.length === 0) dispatch(clearCardSelection())
        else dispatch(setCardSelection(instanceIds))
      },
      pending: false,
      actions: {
        moveCards: moves => dispatch(moveGameCards({ moves })),
        moveCardInLibrary: (instanceId, playerId, position) =>
          dispatch(moveCardInLibrary({ instanceId, playerId, position })),
        toggleTap: instanceId => dispatch(toggleTap({ instanceId })),
        toggleSelectedTap: instanceIds =>
          dispatch(toggleSelectedTap({ instanceIds })),
        setCounter: (instanceId, counter, value) =>
          dispatch(setCounter({ instanceId, counter, value })),
        switchFace: instanceId => dispatch(switchFace({ instanceId })),
        changeStackOrder: (instanceId, direction) =>
          dispatch(changeStackOrder({ instanceId, direction })),
        attach: (attachmentId, targetId) =>
          dispatch(attach({ attachmentId, targetId })),
        detach: attachmentId => dispatch(detach({ attachmentId })),
        duplicateToken: instanceId =>
          dispatch(
            copyToken({
              instanceId,
              duplicateId: `token-${crypto.randomUUID()}`,
            }),
          ),
        createGroup: (playerId, cardIds, name) =>
          dispatch(
            createGroup({
              groupId: `group-${crypto.randomUUID()}`,
              playerId,
              cardIds,
              name,
            }),
          ),
        addToGroup: (groupId, cardIds) =>
          dispatch(addToGroup({ groupId, cardIds })),
        removeFromGroup: (groupId, cardIds) =>
          dispatch(removeFromGroup({ groupId, cardIds })),
        updateGroup: (groupId, changes) =>
          dispatch(updateGroup({ groupId, ...changes })),
        moveGroup: (groupId, position) =>
          dispatch(moveGroup({ groupId, position })),
        dissolveGroup: groupId => dispatch(dissolveGroup({ groupId })),
        drawCards: (playerId, amount) =>
          dispatch(drawCard({ playerId, amount })),
        millCards: (playerId, amount) => dispatch(mill({ playerId, amount })),
        shuffleLibrary: playerId =>
          dispatch(shufflePlayerLibrary({ playerId, seed: randomSeed() })),
        revealLibrary: () => undefined,
        hideLibrary: () => undefined,
        mulligan: playerId =>
          dispatch(mulliganHand({ playerId, seed: randomSeed() })),
        keepHand: playerId => dispatch(keepHand({ playerId })),
        untapAll: playerId => dispatch(untapAll({ playerId })),
        createToken: (playerId, definition, position) =>
          dispatch(
            addKnownToken({
              playerId,
              definitionId: definition.id,
              instanceId: `token-${crypto.randomUUID()}`,
              position,
            }),
          ),
        changeLife: (playerId, delta) =>
          dispatch(changeLife({ playerId, delta })),
        changePoison: (playerId, delta) =>
          dispatch(changePoison({ playerId, delta })),
        changeTracker: (playerId, tracker, delta) =>
          dispatch(changeTracker({ playerId, tracker, delta })),
        setTrackerVisibility: (playerId, tracker, visible) =>
          dispatch(setTrackerVisibility({ playerId, tracker, visible })),
        setCitysBlessing: (playerId, active) =>
          dispatch(setCitysBlessing({ playerId, active })),
        setDisabled: (playerId, disabled) =>
          dispatch(setDisabled({ playerId, disabled })),
        changeCommanderTax: (playerId, commanderId, delta) =>
          dispatch(changeTax({ playerId, commanderId, delta })),
        changeCommanderDamage: (playerId, commanderId, delta) =>
          dispatch(
            changeDamage({ damagedPlayerId: playerId, commanderId, delta }),
          ),
        setMonarch: playerId => dispatch(setMonarch({ playerId })),
        setInitiative: playerId => dispatch(setInitiative({ playerId })),
        setDayNight: status => dispatch(setDayNight({ status })),
        nextPhase: () => dispatch(nextPhase()),
        nextTurn: () => dispatch(nextTurn()),
      },
    }
  }, [dispatch, game, selectedCardIds])
}
