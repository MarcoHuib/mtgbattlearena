import {
  DragDropProvider,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/react"
import { useRef } from "react"
import type { Zone } from "@mtg/game-core/types"
import {
  cardBoundsAtPointer,
  correctionForRelativePoint,
  dragAnchorFromPointer,
  dragAnchorFromRelativePoint,
  fallbackBattlefieldPosition,
  positionFromDrop,
  type DragAnchor,
} from "./battlefieldPosition"
import { battlePlayerIds, useBattleRuntime } from "./BattleRuntime"
import { OpeningHandDialog } from "./OpeningHandDialog"
import { PlayerBoard } from "./PlayerBoard"
import { SelectionToolbar } from "./SelectionToolbar"
import { TableLayout } from "./TableLayout"

const pointerFromEvent = (event: Event | null | undefined) =>
  event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : null

const transformScale = (element: Element) => {
  const transform = getComputedStyle(element).transform
  if (transform === "none") return { x: 1, y: 1 }
  const matrix = new DOMMatrixReadOnly(transform)
  return {
    x: Math.hypot(matrix.a, matrix.b) || 1,
    y: Math.hypot(matrix.c, matrix.d) || 1,
  }
}

export const BattleTable = () => {
  const runtime = useBattleRuntime()
  const { actions, game, selectedCardIds, setSelectedCardIds } = runtime
  const dragAnchor = useRef<DragAnchor | null>(null)
  const playerIds = battlePlayerIds(game)
  const openingPlayerId =
    playerIds.find(
      playerId =>
        runtime.controllablePlayerIds.has(playerId) &&
        !game.openingHands[playerId]?.kept,
    ) ?? null

  const handleDragStart = (event: DragStartEvent) => {
    document.documentElement.classList.add("card-drag-active")
    const pointer = pointerFromEvent(event.operation.activatorEvent)
    const sourceElement = event.operation.source?.element
    if (!pointer || !sourceElement) {
      dragAnchor.current = null
      return
    }
    const sourceBounds = sourceElement.getBoundingClientRect()
    if (sourceElement.classList.contains("card--tapped")) {
      const grabX = Number(sourceElement.getAttribute("data-drag-grab-x"))
      const grabY = Number(sourceElement.getAttribute("data-drag-grab-y"))
      if (Number.isFinite(grabX) && Number.isFinite(grabY)) {
        const relativePoint = { x: grabX, y: grabY }
        dragAnchor.current = dragAnchorFromRelativePoint(
          sourceBounds,
          relativePoint,
        )
        window.requestAnimationFrame(() => {
          if (!sourceElement.hasAttribute("data-dnd-dragging")) return
          const correction = correctionForRelativePoint(
            sourceElement.getBoundingClientRect(),
            event.operation.position.current,
            relativePoint,
          )
          const card = sourceElement as HTMLElement
          card.style.setProperty("--card-drag-follow-x", `${correction.x}px`)
          card.style.setProperty("--card-drag-follow-y", `${correction.y}px`)
        })
        return
      }
    }
    dragAnchor.current = dragAnchorFromPointer(
      sourceBounds,
      pointer,
      transformScale(sourceElement),
    )
  }

  const handleDragEnd = (event: DragEndEvent) => {
    document.documentElement.classList.remove("card-drag-active")
    if (event.canceled || openingPlayerId) {
      dragAnchor.current = null
      return
    }
    const sourceData = event.operation.source?.data
    const targetData = event.operation.target?.data
    if (
      typeof sourceData?.instanceId !== "string" ||
      typeof targetData?.playerId !== "string" ||
      !game.players[targetData.playerId] ||
      typeof targetData.zone !== "string"
    ) {
      dragAnchor.current = null
      return
    }
    const sourceCard = game.cardsById[sourceData.instanceId]
    const playerId = targetData.playerId
    const zone = targetData.zone as Zone
    if (
      !sourceCard ||
      !runtime.controllablePlayerIds.has(sourceCard.controllerId) ||
      !runtime.controllablePlayerIds.has(playerId)
    ) {
      dragAnchor.current = null
      return
    }
    const battlefieldCards =
      zone === "battlefield" ? game.players[playerId].zones.battlefield : []
    const nextZ =
      Math.max(
        0,
        ...battlefieldCards.map(
          instanceId => game.cardsById[instanceId]?.position?.z ?? 0,
        ),
      ) + 1
    const battlefieldSurface =
      zone === "battlefield"
        ? event.operation.target?.element?.querySelector<HTMLElement>(
            ".zone__cards",
          )
        : null
    const cardBounds = event.operation.shape?.current.boundingRectangle ?? null
    const releasePointer = pointerFromEvent(event.nativeEvent)
    const activeDragAnchor = dragAnchor.current
    dragAnchor.current = null
    const placementBounds =
      releasePointer && activeDragAnchor
        ? cardBoundsAtPointer(releasePointer, activeDragAnchor)
        : cardBounds && releasePointer
          ? {
              left: releasePointer.x - cardBounds.width / 2,
              top: releasePointer.y - cardBounds.height / 2,
              width: cardBounds.width,
              height: cardBounds.height,
            }
          : cardBounds
    const position =
      zone === "battlefield" && battlefieldSurface && placementBounds
        ? positionFromDrop(
            placementBounds,
            battlefieldSurface.getBoundingClientRect(),
            nextZ,
          )
        : zone === "battlefield"
          ? fallbackBattlefieldPosition(
              battlefieldCards.length,
              battlefieldCards.length + 1,
            )
          : undefined
    const moveSelection =
      selectedCardIds.includes(sourceData.instanceId) &&
      selectedCardIds.length > 1
        ? selectedCardIds.filter(
            instanceId =>
              game.cardsById[instanceId]?.controllerId ===
              sourceCard.controllerId,
          )
        : []

    if (moveSelection.length > 1) {
      const sourcePosition = sourceCard.position
      const sourceSelectionIndex = moveSelection.indexOf(sourceData.instanceId)
      actions.moveCards(
        moveSelection.map((instanceId, index) => {
          const card = game.cardsById[instanceId]
          const offsetX =
            card?.position && sourcePosition
              ? card.position.x - sourcePosition.x
              : (index - sourceSelectionIndex) * 0.07
          const offsetY =
            card?.position && sourcePosition
              ? card.position.y - sourcePosition.y
              : (index - sourceSelectionIndex) * 0.035
          return {
            instanceId,
            playerId,
            zone,
            position:
              zone === "battlefield" && position
                ? {
                    x: Math.max(0, Math.min(1, position.x + offsetX)),
                    y: Math.max(0, Math.min(1, position.y + offsetY)),
                    z: position.z + index,
                  }
                : undefined,
          }
        }),
      )
      setSelectedCardIds([])
    } else {
      actions.moveCards([
        {
          instanceId: sourceData.instanceId,
          playerId,
          zone,
          position,
        },
      ])
    }
  }

  return (
    <>
      <SelectionToolbar />
      <DragDropProvider onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <TableLayout
          playerIds={playerIds}
          perspectivePlayerId={runtime.viewerPlayerId}
          renderSeat={seat => (
            <PlayerBoard
              playerId={seat.playerId}
              orientation={
                seat.playerId === runtime.viewerPlayerId ? "self" : "opponent"
              }
            />
          )}
        />
        {openingPlayerId ? (
          <OpeningHandDialog key={openingPlayerId} playerId={openingPlayerId} />
        ) : null}
      </DragDropProvider>
    </>
  )
}
