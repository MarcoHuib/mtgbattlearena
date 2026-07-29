import { useEffect, useRef, useState } from "react"

type ZoneBrowseMenuProps = {
  title: string
  onBrowse: () => void
  onSearch: () => void
}

export const ZoneBrowseMenu = ({
  title,
  onBrowse,
  onSearch,
}: ZoneBrowseMenuProps) => {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("pointerdown", closeOnOutsidePointer, true)
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer, true)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  return (
    <div ref={containerRef} className="zone__browse-menu">
      <button
        type="button"
        className="zone__menu-trigger"
        aria-label={`${title}-acties openen`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen(current => !current)
        }}
      >
        ⋮
      </button>
      {open ? (
        <div className="zone__browse-menu-items" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onSearch()
            }}
          >
            <span aria-hidden="true">⌕</span>
            Doorzoek {title.toLowerCase()}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onBrowse()
            }}
          >
            <span aria-hidden="true">▦</span>
            Bekijk alle kaarten
          </button>
        </div>
      ) : null}
    </div>
  )
}
