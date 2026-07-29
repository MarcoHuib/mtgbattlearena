import { screen } from "@testing-library/react"
import { vi } from "vitest"
import { renderWithProviders } from "../../utils/test-utils"
import { ZoneBrowseMenu } from "./ZoneBrowseMenu"

test("opent zoeken of de volledige zone vanuit een toegankelijk menu", async () => {
  const onBrowse = vi.fn()
  const onSearch = vi.fn()
  const { user } = renderWithProviders(
    <ZoneBrowseMenu
      title="Graveyard"
      onBrowse={onBrowse}
      onSearch={onSearch}
    />,
  )

  const trigger = screen.getByRole("button", {
    name: "Graveyard-acties openen",
  })
  await user.click(trigger)
  expect(trigger).toHaveAttribute("aria-expanded", "true")
  await user.click(screen.getByRole("menuitem", { name: "Doorzoek graveyard" }))
  expect(onSearch).toHaveBeenCalledOnce()
  expect(screen.queryByRole("menu")).not.toBeInTheDocument()

  await user.click(trigger)
  await user.click(
    screen.getByRole("menuitem", { name: "Bekijk alle kaarten" }),
  )
  expect(onBrowse).toHaveBeenCalledOnce()
})
