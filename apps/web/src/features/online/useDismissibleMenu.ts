import { useEffect, type RefObject } from "react"

type DismissibleMenuOptions = {
  open: boolean
  boundaryRef: RefObject<HTMLElement | null>
  triggerRef?: RefObject<HTMLElement | null>
  onDismiss: () => void
}

export const useDismissibleMenu = ({
  open,
  boundaryRef,
  triggerRef,
  onDismiss,
}: DismissibleMenuOptions) => {
  useEffect(() => {
    if (!open) return

    const dismissWhenOutside = (event: PointerEvent | FocusEvent) => {
      if (
        event.target instanceof Node &&
        !boundaryRef.current?.contains(event.target)
      ) {
        onDismiss()
      }
    }
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      onDismiss()
      triggerRef?.current?.focus()
    }

    // Capture is nodig omdat dnd-kit pointerevents tijdens een drag kan
    // stoppen voordat ze de document-bubblefase bereiken.
    document.addEventListener("pointerdown", dismissWhenOutside, true)
    document.addEventListener("focusin", dismissWhenOutside, true)
    window.addEventListener("keydown", dismissWithEscape)

    return () => {
      document.removeEventListener("pointerdown", dismissWhenOutside, true)
      document.removeEventListener("focusin", dismissWhenOutside, true)
      window.removeEventListener("keydown", dismissWithEscape)
    }
  }, [boundaryRef, onDismiss, open, triggerRef])
}
