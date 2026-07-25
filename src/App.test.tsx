import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, vi } from "vitest"
import { App } from "./App"
import { archidektFixture, archidektTokenFixture } from "./archidekt/fixtures"
import { renderWithProviders } from "./utils/test-utils"

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(input => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    if (url.includes("/api/import/archidekt/tokens")) {
      return Promise.resolve(
        new Response(JSON.stringify(archidektTokenFixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
    }
    if (url.includes("/api/import/archidekt/")) {
      const deckId = url.split("/").at(-1)
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ...archidektFixture,
            name: deckId === "111" ? "Verdant Resolve" : "Tidal Memory",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
    }
    return Promise.resolve(new Response(null, { status: 503 }))
  })
})

test("importeert twee decks, start een battle en verplaatst via het actiemenu", async () => {
  const { user, store } = renderWithProviders(<App />)

  expect(
    await screen.findByRole("heading", { name: "Leg je battle klaar." }),
  ).toBeInTheDocument()

  const inputs = screen.getAllByLabelText("Openbare Archidekt-URL")
  await user.type(inputs[0]!, "https://archidekt.com/decks/111/verdant")
  await user.click(
    screen.getAllByRole("button", { name: "Deck importeren" })[0]!,
  )
  expect(await screen.findByText("Verdant Resolve")).toBeInTheDocument()
  await user.type(inputs[1]!, "https://archidekt.com/decks/222/tidal")
  await user.click(screen.getByRole("button", { name: "Deck importeren" }))

  expect(await screen.findByText("Tidal Memory")).toBeInTheDocument()
  const start = screen.getByRole("button", { name: "Battle starten" })
  await waitFor(() => expect(start).toBeEnabled())
  await user.click(start)

  expect(
    await screen.findByText("Verdant Resolve vs. Tidal Memory"),
  ).toBeInTheDocument()
  expect(
    store.getState().game.present?.players["player-1"].zones.hand,
  ).toHaveLength(7)
  expect(
    screen.getByRole("dialog", {
      name: "Openingshand van Verdant Resolve",
    }),
  ).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Deze hand houden" }))
  expect(
    screen.getByRole("dialog", {
      name: "Openingshand van Tidal Memory",
    }),
  ).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Deze hand houden" }))
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

  const firstCardId =
    store.getState().game.present?.players["player-1"].zones.hand[0]
  const firstCard = firstCardId
    ? store.getState().game.present?.cardsById[firstCardId]
    : undefined
  const definition = firstCard
    ? store.getState().game.present?.cardDefinitionsById[firstCard.definitionId]
    : undefined
  expect(definition).toBeDefined()

  const card = within(
    screen.getByLabelText("Speelveld van Verdant Resolve"),
  ).getByLabelText(`${definition?.name ?? ""}, Hand`)

  card.focus()
  fireEvent.keyDown(card, { key: "F10", shiftKey: true })
  expect(
    screen.getByRole("dialog", {
      name: `Kaartacties voor ${definition?.name ?? ""}`,
    }),
  ).toBeInTheDocument()

  await user.selectOptions(
    screen.getByLabelText(`Verplaats ${definition?.name ?? ""}`),
    "battlefield",
  )
  expect(store.getState().game.present?.cardDefinitionsById).toBe(
    store.getState().game.past.at(-1)?.cardDefinitionsById,
  )
  expect(
    store.getState().game.present?.players["player-1"].zones.battlefield,
  ).toContain(firstCardId)

  const playerBoard = screen.getByLabelText("Speelveld van Verdant Resolve")
  await user.click(
    within(playerBoard).getByRole("button", {
      name: "Library-acties openen",
    }),
  )
  await user.click(
    screen.getByRole("button", {
      name: /Bekijk library/,
    }),
  )
  const libraryDialog = screen.getByRole("dialog", {
    name: "Library bekijken",
  })
  const libraryCardId = store
    .getState()
    .game.present?.players["player-1"].zones.library.at(-1)
  const libraryCard = libraryCardId
    ? store.getState().game.present?.cardsById[libraryCardId]
    : undefined
  const libraryDefinition = libraryCard
    ? store.getState().game.present?.cardDefinitionsById[
        libraryCard.definitionId
      ]
    : undefined
  await user.type(
    within(libraryDialog).getByLabelText("Zoek op kaartnaam"),
    libraryDefinition?.name ?? "",
  )
  expect(
    within(libraryDialog).getByText(libraryDefinition?.name ?? ""),
  ).toBeInTheDocument()
  const libraryCardView = within(libraryDialog).getByLabelText(
    `${libraryDefinition?.name ?? ""}, Library`,
  )
  libraryCardView.focus()
  fireEvent.keyDown(libraryCardView, { key: "F10", shiftKey: true })
  expect(
    screen.getByRole("dialog", {
      name: `Kaartacties voor ${libraryDefinition?.name ?? ""}`,
    }),
  ).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Kaartacties sluiten" }))
  await user.click(
    within(libraryDialog).getByLabelText("Bekijk alleen de bovenste"),
  )
  fireEvent.keyDown(window, { key: "Escape" })
  expect(screen.queryByRole("dialog", { name: "Library bekijken" })).toBeNull()

  const battlefield = playerBoard.querySelector(".zone--battlefield")
  expect(battlefield).not.toBeNull()
  fireEvent.contextMenu(battlefield!, { clientX: 300, clientY: 300 })
  const battlefieldActions = screen.getByRole("dialog", {
    name: "Battlefieldacties",
  })
  await user.click(
    within(battlefieldActions).getByRole("button", { name: /Treasure/ }),
  )
  const treasure = Object.values(
    store.getState().game.present?.cardsById ?? {},
  ).find(card => {
    const currentGame = store.getState().game.present
    return (
      card.zone === "battlefield" &&
      currentGame?.cardDefinitionsById[card.definitionId]?.name === "Treasure"
    )
  })
  expect(treasure).toBeDefined()
  expect(
    store.getState().game.present?.cardDefinitionsById[
      treasure?.definitionId ?? ""
    ]?.imageRefs[0]?.url,
  ).toBe(
    "https://card-images.archidekt.com/normal/front/f/9/f909bd95-58a1-4299-9570-87724145fc85.jpg?1783902798",
  )

  await waitFor(
    () => {
      expect(store.getState().ui.saveStatus).toBe("saved")
    },
    {
      timeout: 2_000,
    },
  )
})
