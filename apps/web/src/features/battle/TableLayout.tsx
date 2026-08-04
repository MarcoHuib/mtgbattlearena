import { useEffect, useRef, type CSSProperties, type ReactNode } from "react"
import type { PlayerId } from "@mtg/game-core/types"
import { MatchStatusBar } from "./MatchStatusBar"
import { createTableSeats, type TableSeat } from "./tableSeats"
import { tableCameraPanDelta } from "./tablePan"

type TableLayoutProps = {
  playerIds: readonly PlayerId[]
  renderSeat: (seat: TableSeat) => ReactNode
}

export const TableLayout = ({ playerIds, renderSeat }: TableLayoutProps) => {
  const layoutRef = useRef<HTMLElement>(null)
  const cameraRef = useRef<HTMLDivElement>(null)
  const centerControlsRef = useRef<HTMLDivElement>(null)
  const seats = createTableSeats(playerIds)
  const columnCount = Math.ceil(playerIds.length / 2)
  const byPosition = new Map(
    seats.map(seat => [`${seat.row}-${seat.columnIndex}`, seat]),
  )
  const surfaceStyle = {
    "--table-column-count": columnCount,
  } as CSSProperties

  useEffect(() => {
    const layout = layoutRef.current
    const camera = cameraRef.current
    const centerControls = centerControlsRef.current
    if (!layout || !camera || !centerControls) return

    const panTable = (event: WheelEvent) => {
      if (document.documentElement.classList.contains("card-drag-active")) {
        return
      }
      const delta = tableCameraPanDelta(event)
      if (delta === null) return
      const multiplier =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? camera.clientWidth
            : 1
      event.preventDefault()
      camera.scrollLeft += delta.x * multiplier
      camera.scrollTop += delta.y * multiplier
    }
    let touchPan:
      | {
          pointerId: number
          startX: number
          startY: number
          startScrollLeft: number
          startScrollTop: number
          panning: boolean
        }
      | undefined
    const startsInteractiveAction = (target: EventTarget | null) =>
      target instanceof Element &&
      Boolean(
        target.closest(
          "button, input, select, textarea, a, [role='dialog'], [data-battle-draggable='true']",
        ),
      )
    const startTouchPan = (event: PointerEvent) => {
      if (
        event.pointerType !== "touch" ||
        !event.isPrimary ||
        startsInteractiveAction(event.target)
      ) {
        return
      }
      touchPan = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startScrollLeft: camera.scrollLeft,
        startScrollTop: camera.scrollTop,
        panning: false,
      }
    }
    const moveTouchPan = (event: PointerEvent) => {
      const activeTouchPan = touchPan
      if (event.pointerId !== activeTouchPan?.pointerId) return
      if (document.documentElement.classList.contains("card-drag-active")) {
        touchPan = undefined
        return
      }
      const deltaX = event.clientX - activeTouchPan.startX
      const deltaY = event.clientY - activeTouchPan.startY
      if (!activeTouchPan.panning) {
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 8) return
        activeTouchPan.panning = true
        layout.setPointerCapture(event.pointerId)
      }
      event.preventDefault()
      camera.scrollLeft = activeTouchPan.startScrollLeft - deltaX
      camera.scrollTop = activeTouchPan.startScrollTop - deltaY
    }
    const stopTouchPan = (event: PointerEvent) => {
      if (event.pointerId !== touchPan?.pointerId) return
      if (layout.hasPointerCapture(event.pointerId)) {
        layout.releasePointerCapture(event.pointerId)
      }
      touchPan = undefined
    }
    const keepHudHorizontallyCentered = () => {
      centerControls.style.transform = `translateX(${camera.scrollLeft}px)`
    }

    layout.addEventListener("wheel", panTable, {
      capture: true,
      passive: false,
    })
    layout.addEventListener("pointerdown", startTouchPan, true)
    layout.addEventListener("pointermove", moveTouchPan, {
      capture: true,
      passive: false,
    })
    layout.addEventListener("pointerup", stopTouchPan, true)
    layout.addEventListener("pointercancel", stopTouchPan, true)
    camera.addEventListener("scroll", keepHudHorizontallyCentered, {
      passive: true,
    })
    camera.scrollTop = Math.max(
      0,
      (camera.scrollHeight - camera.clientHeight) / 2,
    )
    keepHudHorizontallyCentered()
    return () => {
      layout.removeEventListener("wheel", panTable, { capture: true })
      layout.removeEventListener("pointerdown", startTouchPan, true)
      layout.removeEventListener("pointermove", moveTouchPan, {
        capture: true,
      })
      layout.removeEventListener("pointerup", stopTouchPan, true)
      layout.removeEventListener("pointercancel", stopTouchPan, true)
      camera.removeEventListener("scroll", keepHudHorizontallyCentered)
    }
  }, [])

  const renderRow = (row: "top" | "bottom") => (
    <div className={`table-layout__lane table-layout__lane--${row}`}>
      {Array.from({ length: columnCount }, (_, columnIndex) => {
        const seat = byPosition.get(`${row}-${columnIndex}`)
        return (
          <div
            className={`table-layout__seat table-layout__seat--${row}`}
            data-seat-row={row}
            data-seat-column={columnIndex}
            data-seat-player={seat?.playerId ?? ""}
            data-opposite-player={seat?.oppositePlayerId ?? ""}
            key={`${row}-${columnIndex}`}
          >
            {seat ? (
              renderSeat(seat)
            ) : (
              <div className="table-layout__empty-seat" aria-hidden="true" />
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <section
      ref={layoutRef}
      className="table-layout"
      aria-label={`Commandertafel met ${playerIds.length} spelers`}
    >
      <div
        ref={cameraRef}
        className="table-layout__camera"
        data-testid="table-camera"
      >
        <div className="table-layout__surface" style={surfaceStyle}>
          {renderRow("top")}
          <div
            className="table-layout__center-bar table-divider"
            data-testid="table-center-bar"
          >
            <div
              ref={centerControlsRef}
              className="table-layout__center-controls"
              data-testid="table-center-controls"
            >
              <MatchStatusBar />
            </div>
          </div>
          {renderRow("bottom")}
        </div>
      </div>
    </section>
  )
}
