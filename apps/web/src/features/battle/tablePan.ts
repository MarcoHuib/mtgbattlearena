export type TablePanInput = {
  deltaX: number
  deltaY: number
  shiftKey?: boolean
  ctrlKey?: boolean
}

export type TablePanDelta = {
  x: number
  y: number
}

const MINIMUM_PAN_DELTA = 1

export const tableCameraPanDelta = ({
  deltaX,
  deltaY,
  shiftKey = false,
  ctrlKey = false,
}: TablePanInput): TablePanDelta | null => {
  if (ctrlKey) return null
  if (shiftKey && Math.abs(deltaX) < Math.abs(deltaY)) {
    return Math.abs(deltaY) < MINIMUM_PAN_DELTA ? null : { x: deltaY, y: 0 }
  }
  if (
    Math.abs(deltaX) < MINIMUM_PAN_DELTA &&
    Math.abs(deltaY) < MINIMUM_PAN_DELTA
  ) {
    return null
  }
  return { x: deltaX, y: deltaY }
}
