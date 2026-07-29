import {
  DragDropProvider,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/react"
import { useRef } from "react"
import { useAppDispatch, useAppSelector } from "../../app/hooks"
import { AppLink } from "../../app/router"
import { Brand } from "../../components/Brand"
import { StatusBar } from "../../components/StatusBar"
import type { PlayerId, Zone } from "../../game-core/types"
import { moveGameCard, moveGameCards, redo, undo } from "../game/gameSlice"
import { setOfflinePanel } from "../offline/offlineSlice"
import { clearCardSelection } from "../ui/uiSlice"
import { OfflinePanel } from "../offline/OfflinePanel"
import {
  cardBoundsAtPointer,
  correctionForRelativePoint,
  dragAnchorFromPointer,
  dragAnchorFromRelativePoint,
  fallbackBattlefieldPosition,
  positionFromDrop,
  type DragAnchor,
} from "./battlefieldPosition"
import { OpeningHandDialog } from "./OpeningHandDialog"
import { MatchStatusBar } from "./MatchStatusBar"
import { PlayerBoard } from "./PlayerBoard"
import { SelectionToolbar } from "./SelectionToolbar"

type BattleScreenProps = {
  onNewBattle: () => void
}

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

export const BattleScreen = ({ onNewBattle }: BattleScreenProps) => {
  const dispatch = useAppDispatch()
  const dragAnchor = useRef<DragAnchor | null>(null)
  const game = useAppSelector(state => state.game)
  const selectedCardIds = useAppSelector(state => state.ui.selectedCardIds)
  const restored = useAppSelector(state => state.ui.restored)
  const offline = useAppSelector(state => state.offline.current)
  const openingPlayerId: PlayerId | null = game.present
    ? !game.present.openingHands["player-1"].kept
      ? "player-1"
      : !game.present.openingHands["player-2"].kept
        ? "player-2"
        : null
    : null

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
          const currentPointer = event.operation.position.current
          const correction = correctionForRelativePoint(
            sourceElement.getBoundingClientRect(),
            currentPointer,
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
      (targetData?.playerId !== "player-1" &&
        targetData?.playerId !== "player-2") ||
      typeof targetData.zone !== "string"
    ) {
      dragAnchor.current = null
      return
    }
    const playerId = targetData.playerId as PlayerId
    const zone = targetData.zone as Zone
    const battlefieldCards =
      zone === "battlefield"
        ? (game.present?.players[playerId].zones.battlefield ?? [])
        : []
    const nextZ =
      Math.max(
        0,
        ...battlefieldCards.map(
          instanceId => game.present?.cardsById[instanceId]?.position?.z ?? 0,
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

    const sourceCard = game.present?.cardsById[sourceData.instanceId]
    const moveSelection =
      selectedCardIds.includes(sourceData.instanceId) &&
      selectedCardIds.length > 1
        ? selectedCardIds.filter(
            instanceId =>
              game.present?.cardsById[instanceId]?.controllerId ===
              sourceCard?.controllerId,
          )
        : []

    if (moveSelection.length > 1) {
      const sourcePosition = sourceCard?.position
      const sourceSelectionIndex = moveSelection.indexOf(sourceData.instanceId)
      dispatch(
        moveGameCards({
          moves: moveSelection.map((instanceId, index) => {
            const card = game.present?.cardsById[instanceId]
            const offsetX =
              card?.position && sourcePosition
                ? card.position.x - sourcePosition.x
                : (index - sourceSelectionIndex) * 0.07
            const offsetY =
              card?.position && sourcePosition
                ? card.position.y - sourcePosition.y
                : (index - sourceSelectionIndex) * 0.035
            const relativePosition =
              zone === "battlefield" && position
                ? {
                    x: Math.max(0, Math.min(1, position.x + offsetX)),
                    y: Math.max(0, Math.min(1, position.y + offsetY)),
                    z: position.z + index,
                  }
                : undefined
            return {
              instanceId,
              playerId,
              zone,
              position: relativePosition,
            }
          }),
        }),
      )
      dispatch(clearCardSelection())
    } else {
      dispatch(
        moveGameCard({
          instanceId: sourceData.instanceId,
          playerId,
          zone,
          position,
        }),
      )
    }
  }

  return (
    <main className="battle-screen">
      <header className="battle-header">
        <AppLink to="/" className="brand-link">
          <Brand />
        </AppLink>
        <div className="battle-title">
          <span className="eyebrow">
            {restored ? "Lokale battle hervat" : "Actieve battle"}
          </span>
          <strong>{game.present?.title}</strong>
        </div>
        <StatusBar />
        <nav className="battle-actions" aria-label="Battleacties">
          <button
            className="icon-button"
            type="button"
            disabled={game.past.length === 0}
            onClick={() => {
              dispatch(undo())
            }}
          >
            ↶ <span>Undo</span>
          </button>
          <button
            className="icon-button"
            type="button"
            disabled={game.future.length === 0}
            onClick={() => {
              dispatch(redo())
            }}
          >
            ↷ <span>Redo</span>
          </button>
          <button
            className={`button button--offline ${
              offline?.status === "complete" ? "is-complete" : ""
            }`}
            type="button"
            onClick={() => {
              dispatch(setOfflinePanel(true))
            }}
          >
            {offline?.status === "complete"
              ? "✓ Offline beschikbaar"
              : "Download voor offline gebruik"}
          </button>
          <button
            className="button button--ghost"
            type="button"
            onClick={onNewBattle}
          >
            Nieuwe battle
          </button>
        </nav>
      </header>
      <SelectionToolbar />
      <DragDropProvider onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="battle-table">
          <PlayerBoard playerId="player-2" orientation="opponent" />
          <div className="table-divider">
            <MatchStatusBar />
          </div>
          <PlayerBoard playerId="player-1" orientation="self" />
        </div>
        {openingPlayerId ? (
          <OpeningHandDialog key={openingPlayerId} playerId={openingPlayerId} />
        ) : null}
      </DragDropProvider>
      <OfflinePanel />
    </main>
  )
}
