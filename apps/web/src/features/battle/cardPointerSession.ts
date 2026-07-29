import {
  dragCorrectionAfterScale,
  relativePointInRectangle,
} from "./battlefieldPosition"

const POINTER_ACTIVE_CLASS = "card-pointer-active"
const DRAG_OFFSET_X = "--card-drag-offset-x"
const DRAG_OFFSET_Y = "--card-drag-offset-y"
const DRAG_FOLLOW_X = "--card-drag-follow-x"
const DRAG_FOLLOW_Y = "--card-drag-follow-y"

let pointerSessionSequence = 0
let activePointerSession: number | null = null
let clearHoverSuppression: (() => void) | null = null

const transformScale = (element: Element) => {
  const transform = getComputedStyle(element).transform
  if (transform === "none") return { x: 1, y: 1 }
  const matrix = new DOMMatrixReadOnly(transform)
  return {
    x: Math.hypot(matrix.a, matrix.b) || 1,
    y: Math.hypot(matrix.c, matrix.d) || 1,
  }
}

export const beginCardPointerSession = (
  card: HTMLElement,
  pointer: { x: number; y: number },
  tapped: boolean,
) => {
  clearHoverSuppression?.()
  pointerSessionSequence += 1
  const session = pointerSessionSequence
  activePointerSession = session
  card.style.removeProperty(DRAG_OFFSET_X)
  card.style.removeProperty(DRAG_OFFSET_Y)
  card.style.removeProperty(DRAG_FOLLOW_X)
  card.style.removeProperty(DRAG_FOLLOW_Y)
  if (tapped) {
    const bounds = card.getBoundingClientRect()
    const relativePoint = relativePointInRectangle(bounds, pointer)
    const correction = dragCorrectionAfterScale(
      bounds,
      pointer,
      transformScale(card),
    )
    card.dataset.dragGrabX = String(relativePoint.x)
    card.dataset.dragGrabY = String(relativePoint.y)
    card.style.setProperty(DRAG_OFFSET_X, `${correction.x}px`)
    card.style.setProperty(DRAG_OFFSET_Y, `${correction.y}px`)
  }
  document.documentElement.classList.add(POINTER_ACTIVE_CLASS)
  let released = false
  const releasePointerSession = () => {
    if (released) return
    released = true
    window.removeEventListener("pointerup", releasePointerSession, true)
    window.removeEventListener("pointercancel", releasePointerSession, true)
    window.removeEventListener("blur", releasePointerSession)
    finishPointerSession(session, card)
  }
  window.addEventListener("pointerup", releasePointerSession, true)
  window.addEventListener("pointercancel", releasePointerSession, true)
  window.addEventListener("blur", releasePointerSession)
}

const finishPointerSession = (session: number, card: HTMLElement) => {
  card.style.removeProperty(DRAG_OFFSET_X)
  card.style.removeProperty(DRAG_OFFSET_Y)
  card.style.removeProperty(DRAG_FOLLOW_X)
  card.style.removeProperty(DRAG_FOLLOW_Y)
  delete card.dataset.dragGrabX
  delete card.dataset.dragGrabY
  if (activePointerSession !== session) return

  const releaseHoverSuppression = () => {
    window.removeEventListener("pointermove", releaseHoverSuppression, true)
    window.removeEventListener("pointerdown", releaseHoverSuppression, true)
    window.removeEventListener("blur", releaseHoverSuppression)
    if (activePointerSession === session) {
      activePointerSession = null
      document.documentElement.classList.remove(POINTER_ACTIVE_CLASS)
    }
    if (clearHoverSuppression === releaseHoverSuppression) {
      clearHoverSuppression = null
    }
  }

  // Houd de kaart na het neerleggen op normale grootte totdat de pointer
  // bewust verder beweegt. Dit voorkomt een terugkerende hoverzoom.
  clearHoverSuppression = releaseHoverSuppression
  window.addEventListener("pointermove", releaseHoverSuppression, true)
  window.addEventListener("pointerdown", releaseHoverSuppression, true)
  window.addEventListener("blur", releaseHoverSuppression)
}
