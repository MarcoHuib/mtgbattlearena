import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, vi } from "vitest"
import { App } from "./App"
import * as importDeckApi from "./app/api/importDeck"
import { importedDeckFixture } from "./utils/importedDeckFixture"
import { renderWithProviders } from "./utils/test-utils"

beforeEach(() => {
  window.history.replaceState({}, "", "/")
  vi.spyOn(importDeckApi, "importDeckFromUrl").mockImplementation(
    (_dispatch, url) => {
      const deckId = /\/decks\/(\d+)/.exec(url)?.[1] ?? "unknown"
      return Promise.resolve({
        ...importedDeckFixture(
          deckId,
          deckId === "111" ? "Verdant Resolve" : "Tidal Memory",
        ),
        id: `00000000-0000-4000-8000-${deckId.padStart(12, "0")}`,
      })
    },
  )
  vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    return Promise.resolve(new Response(null, { status: 503 }))
  })
})

test("importeert twee decks, start een battle en verplaatst via het actiemenu", async () => {
  const { user, store } = renderWithProviders(<App />)

  expect(
    await screen.findByRole("heading", {
      name: "Roep je deck bijeen. Begin de battle.",
    }),
  ).toBeInTheDocument()
  await user.click(screen.getByRole("link", { name: /Offline spelen/ }))
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
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const startGame = screen.queryByRole("button", {
      name: "Start wedstrijd",
    })
    if (startGame) {
      await user.click(startGame)
      break
    }
    const roll = screen.getByRole("button", {
      name: /Laat (iedereen|tied spelers) .*gooien/,
    })
    await user.click(roll)
    await waitFor(
      () => {
        expect(
          screen.queryByRole("button", { name: "Start wedstrijd" }) ??
            screen.queryByRole("button", {
              name: /Laat (iedereen|tied spelers) .*gooien/,
            }),
        ).toBeTruthy()
      },
      { timeout: 2_000 },
    )
  }
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
  const libraryActions = screen.getByRole("dialog", {
    name: "Libraryacties",
  })
  expect(
    within(libraryActions).getByRole("button", { name: /Trek een kaart/ }),
  ).toBeInTheDocument()
  expect(
    within(libraryActions).getByRole("button", { name: "Trek X" }),
  ).toBeInTheDocument()
  expect(
    within(libraryActions).getByRole("button", { name: "Mill X" }),
  ).toBeInTheDocument()
  expect(
    within(libraryActions).getByRole("button", { name: /Schud library/ }),
  ).toBeInTheDocument()
  expect(
    within(libraryActions).getByRole("button", { name: /Mulligan/ }),
  ).toBeInTheDocument()
  expect(
    within(playerBoard.querySelector(".player-rail")!).queryByRole("button", {
      name: /Trek|Mill|Schud|Untap alles/,
    }),
  ).not.toBeInTheDocument()
  await user.click(
    within(libraryActions).getByRole("button", {
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
    within(libraryDialog).getAllByText(libraryDefinition?.name ?? "")[0],
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
  expect(
    within(battlefieldActions).getByRole("button", { name: /Untap alles/ }),
  ).toBeInTheDocument()
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

  await user.click(within(playerBoard).getByText("Optionele trackers"))
  await user.click(
    within(playerBoard).getByRole("checkbox", { name: "Energy" }),
  )
  await user.click(
    within(playerBoard).getByRole("button", {
      name: "Verhoog Energy van Verdant Resolve",
    }),
  )
  expect(
    store.getState().game.present?.players["player-1"].trackers.energy,
  ).toBe(1)
  await user.click(
    within(playerBoard).getByRole("button", { name: "City's Blessing" }),
  )
  expect(store.getState().game.present?.players["player-1"].citysBlessing).toBe(
    true,
  )
  await user.click(
    within(playerBoard).getByRole("button", {
      name: "Speler uitschakelen",
    }),
  )
  expect(store.getState().game.present?.players["player-1"].disabled).toBe(true)
  await user.click(
    within(playerBoard).getByRole("button", {
      name: "Uitgeschakeld",
    }),
  )
  expect(store.getState().game.present?.players["player-1"].disabled).toBe(
    false,
  )
  await user.selectOptions(screen.getByLabelText("Monarch-houder"), "player-1")
  await user.selectOptions(
    screen.getByLabelText("Initiative-houder"),
    "player-2",
  )
  await user.selectOptions(screen.getByLabelText("Dag- en nachtstatus"), "day")
  expect(store.getState().game.present?.matchStatus).toEqual({
    monarchPlayerId: "player-1",
    initiativePlayerId: "player-2",
    dayNight: "day",
  })

  const commanderTaxButton = within(playerBoard).getByRole("button", {
    name: /Verhoog commander tax van/,
  })
  await user.click(commanderTaxButton)
  const commanderId =
    store.getState().game.present?.players["player-1"].zones.command[0] ?? ""
  expect(
    store.getState().game.present?.players["player-1"].commanderTax[
      commanderId
    ],
  ).toBe(2)

  await waitFor(
    () => {
      expect(store.getState().ui.saveStatus).toBe("saved")
    },
    {
      timeout: 2_000,
    },
  )
})
