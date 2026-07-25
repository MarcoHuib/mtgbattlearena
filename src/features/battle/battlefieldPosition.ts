import type { BattlefieldPosition } from "../../game-core/types"

export type RectangleBounds = {
  left: number
  top: number
  width: number
  height: number
}

export type PointCoordinates = {
  x: number
  y: number
}

export type DragAnchor = {
  offsetX: number
  offsetY: number
  width: number
  height: number
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

export const relativePointInRectangle = (
  rectangle: RectangleBounds,
  point: PointCoordinates,
): PointCoordinates => ({
  x:
    rectangle.width > 0
      ? clamp((point.x - rectangle.left) / rectangle.width, 0, 1)
      : 0.5,
  y:
    rectangle.height > 0
      ? clamp((point.y - rectangle.top) / rectangle.height, 0, 1)
      : 0.5,
})

export const correctionForRelativePoint = (
  rectangle: RectangleBounds,
  point: PointCoordinates,
  relativePoint: PointCoordinates,
): PointCoordinates => ({
  x: point.x - (rectangle.left + rectangle.width * relativePoint.x),
  y: point.y - (rectangle.top + rectangle.height * relativePoint.y),
})

export const dragCorrectionAfterScale = (
  card: RectangleBounds,
  pointer: PointCoordinates,
  scale: PointCoordinates,
): PointCoordinates => {
  const scaleX = scale.x > 0 ? scale.x : 1
  const scaleY = scale.y > 0 ? scale.y : 1
  const centerX = card.left + card.width / 2
  const centerY = card.top + card.height / 2

  return {
    x: (pointer.x - centerX) * (1 - 1 / scaleX),
    y: (pointer.y - centerY) * (1 - 1 / scaleY),
  }
}

export const dragAnchorFromPointer = (
  card: RectangleBounds,
  pointer: PointCoordinates,
  scale: PointCoordinates,
): DragAnchor => {
  const scaleX = scale.x > 0 ? scale.x : 1
  const scaleY = scale.y > 0 ? scale.y : 1

  return {
    offsetX: (pointer.x - (card.left + card.width / 2)) / scaleX,
    offsetY: (pointer.y - (card.top + card.height / 2)) / scaleY,
    width: card.width / scaleX,
    height: card.height / scaleY,
  }
}

export const dragAnchorFromRelativePoint = (
  card: RectangleBounds,
  relativePoint: PointCoordinates,
): DragAnchor => ({
  offsetX: (relativePoint.x - 0.5) * card.width,
  offsetY: (relativePoint.y - 0.5) * card.height,
  width: card.width,
  height: card.height,
})

export const cardBoundsAtPointer = (
  pointer: PointCoordinates,
  anchor: DragAnchor,
): RectangleBounds => {
  const centerX = pointer.x - anchor.offsetX
  const centerY = pointer.y - anchor.offsetY

  return {
    left: centerX - anchor.width / 2,
    top: centerY - anchor.height / 2,
    width: anchor.width,
    height: anchor.height,
  }
}

export const positionFromDrop = (
  card: RectangleBounds,
  battlefield: RectangleBounds,
  z: number,
): BattlefieldPosition => {
  if (battlefield.width <= 0 || battlefield.height <= 0) {
    return { x: 0.5, y: 0.5, z }
  }

  const halfCardWidth = Math.min(0.5, card.width / 2 / battlefield.width)
  const halfCardHeight = Math.min(0.5, card.height / 2 / battlefield.height)
  const centerX = card.left + card.width / 2
  const centerY = card.top + card.height / 2

  return {
    x: clamp(
      (centerX - battlefield.left) / battlefield.width,
      halfCardWidth,
      1 - halfCardWidth,
    ),
    y: clamp(
      (centerY - battlefield.top) / battlefield.height,
      halfCardHeight,
      1 - halfCardHeight,
    ),
    z,
  }
}

export const fallbackBattlefieldPosition = (
  index: number,
  total: number,
): BattlefieldPosition => {
  const safeTotal = Math.max(1, total)
  const columns = Math.min(8, Math.max(1, Math.ceil(Math.sqrt(safeTotal * 2))))
  const rows = Math.ceil(safeTotal / columns)
  const column = index % columns
  const row = Math.floor(index / columns)

  return {
    x: (column + 0.5) / columns,
    y: (row + 0.5) / rows,
    z: index + 1,
  }
}

export const safeBattlefieldPosition = (
  position: BattlefieldPosition,
): BattlefieldPosition => ({
  x: clamp(position.x, 0, 1),
  y: clamp(position.y, 0, 1),
  z: Math.max(0, position.z),
})
