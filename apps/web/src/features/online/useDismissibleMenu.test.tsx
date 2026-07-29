import { fireEvent, render, screen } from "@testing-library/react"
import { useRef, useState } from "react"
import { useDismissibleMenu } from "./useDismissibleMenu"

const MenuHarness = () => {
  const [open, setOpen] = useState(false)
  const boundaryRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useDismissibleMenu({
    open,
    boundaryRef,
    triggerRef,
    onDismiss: () => {
      setOpen(false)
    },
  })

  return (
    <>
      <div ref={boundaryRef}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            setOpen(current => !current)
          }}
        >
          Acties
        </button>
        {open ? <div role="menu">Kaartmenu</div> : null}
      </div>
      <button
        type="button"
        onPointerDown={event => {
          event.stopPropagation()
        }}
      >
        Buiten menu
      </button>
    </>
  )
}

test("sluit een menu bij buitenklikken, ook als de pagina het event stopt", () => {
  render(<MenuHarness />)

  fireEvent.click(screen.getByRole("button", { name: "Acties" }))
  expect(screen.getByRole("menu")).toBeInTheDocument()

  fireEvent.pointerDown(screen.getByRole("button", { name: "Buiten menu" }))
  expect(screen.queryByRole("menu")).not.toBeInTheDocument()
})

test("sluit een menu met Escape en geeft focus terug aan de trigger", () => {
  render(<MenuHarness />)
  const trigger = screen.getByRole("button", { name: "Acties" })

  fireEvent.click(trigger)
  fireEvent.keyDown(window, { key: "Escape" })

  expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})
