import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { CloudDeckMetadata } from "@mtg/game-core/types"
import { renderWithProviders } from "../../utils/test-utils"
import { DecksScreen, validateArchidektUrl } from "./DecksScreen"
import type { AuthService, AuthState } from "../online/types"
import type { CloudDeckRepository } from "../decks/cloudDeckRepository"

const api = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}))

vi.mock("../../app/api/remoteGraphqlApi", () => ({
  useCreateCloudDeckMutation: () => [api.create],
  useUpdateCloudDeckMutation: () => [api.update],
  useDeleteCloudDeckMutation: () => [api.remove],
}))

vi.mock("../../components/StatusBar", () => ({
  StatusBar: () => <span data-testid="status-bar" />,
}))

const deck: CloudDeckMetadata = {
  deckKey: "archidekt_NDI",
  provider: "archidekt",
  externalDeckKey: "42",
  sourceUrl: "https://archidekt.com/decks/42/test",
  name: "Edgar Markov",
  format: "Commander",
  commanderSummary: "Edgar Markov",
  thumbnailImageRef: {
    resolver: 1,
    imageId: "00000000-0000-4000-8000-000000000001",
    faceIndex: 0,
    variant: "normal",
  },
  colorIdentity: ["W", "B", "R"],
  cardCount: 100,
  createdAt: "2026-08-13T10:00:00.000Z",
  updatedAt: "2026-08-13T10:00:00.000Z",
}

const signedInAuth = (): AuthService => {
  const state: AuthState = {
    status: "signed-in",
    user: { uid: "owner-a", displayName: "A", isAnonymous: false },
  }
  return {
    getState: () => state,
    subscribe: () => () => undefined,
    getIdToken: () => Promise.resolve("token"),
    signInWithEmail: vi.fn(),
    registerWithEmail: vi.fn(),
    signInWithGoogle: vi.fn(),
    signInWithMicrosoft: vi.fn(),
    signOut: vi.fn(),
  }
}

const repository = (items: CloudDeckMetadata[] = []): CloudDeckRepository => ({
  list: vi.fn().mockResolvedValue(items),
  getContent: vi.fn(),
})

const mutation = <T,>(result: T) => ({ unwrap: () => Promise.resolve(result) })
const rejectedMutation = (error: unknown) => ({
  unwrap: () =>
    Promise.reject(
      error instanceof Error
        ? error
        : Object.assign(new Error("Mutation failed"), error),
    ),
})

beforeEach(() => {
  api.create.mockReset()
  api.update.mockReset()
  api.remove.mockReset()
})

test("valideert uitsluitend bruikbare openbare Archidekt-URLs", () => {
  expect(validateArchidektUrl("")).toMatch(/Plak eerst/)
  expect(validateArchidektUrl("https://moxfield.com/decks/test")).toMatch(
    /archidekt.com/,
  )
  expect(validateArchidektUrl("https://archidekt.com/decks/no-id")).toMatch(
    /deck-ID/,
  )
  expect(
    validateArchidektUrl("https://archidekt.com/decks/42/edgar"),
  ).toBeNull()
})

test("toont een compacte empty state en primaire Decks-navigatie", async () => {
  renderWithProviders(
    <DecksScreen auth={signedInAuth()} repository={repository()} />,
  )
  expect(
    await screen.findByRole("heading", { name: "Je hebt nog geen decks" }),
  ).toBeVisible()
  expect(screen.getByRole("link", { name: "Decks" })).toHaveAttribute(
    "href",
    "/decks",
  )
  expect(screen.getByRole("link", { name: "Decks" })).toHaveClass("is-active")
})

test("doorloopt provider- en URL-stap met unavailable providers", async () => {
  const user = userEvent.setup()
  renderWithProviders(
    <DecksScreen auth={signedInAuth()} repository={repository()} />,
  )
  await user.click(
    await screen.findByRole("button", { name: "Deck toevoegen" }),
  )
  expect(screen.getByLabelText("Stap 1 van 4")).toBeVisible()
  expect(screen.getByRole("radio", { name: /Moxfield/ })).toBeDisabled()
  expect(screen.getByRole("radio", { name: /ManaBox/ })).toBeDisabled()
  const next = screen.getByRole("button", { name: /Verder/ })
  expect(next).toBeDisabled()
  await user.click(screen.getByRole("radio", { name: /Archidekt/ }))
  await user.click(next)
  expect(screen.getByLabelText("Archidekt deck-URL")).toBeVisible()
  await user.type(
    screen.getByLabelText("Archidekt deck-URL"),
    "https://moxfield.com/decks/x",
  )
  expect(screen.getByRole("alert")).toHaveTextContent("archidekt.com")
  expect(screen.getByRole("button", { name: "Import starten" })).toBeDisabled()
  await user.click(screen.getByRole("button", { name: /Terug/ }))
  expect(screen.getByLabelText("Stap 1 van 4")).toBeVisible()
})

test("voorkomt dubbele submit en toont succes met het nieuwe deck", async () => {
  let finish:
    ((value: { createCloudDeck: CloudDeckMetadata }) => void) | undefined
  api.create.mockReturnValue({
    unwrap: () =>
      new Promise(resolve => {
        finish = resolve
      }),
  })
  const user = userEvent.setup()
  renderWithProviders(
    <DecksScreen auth={signedInAuth()} repository={repository()} />,
  )
  await user.click(
    await screen.findByRole("button", { name: "Deck toevoegen" }),
  )
  await user.click(screen.getByRole("radio", { name: /Archidekt/ }))
  await user.click(screen.getByRole("button", { name: /Verder/ }))
  await user.type(screen.getByLabelText("Archidekt deck-URL"), deck.sourceUrl)
  const submit = screen.getByRole("button", { name: "Import starten" })
  await user.dblClick(submit)
  expect(api.create).toHaveBeenCalledTimes(1)
  expect(screen.getByText("Archidekt importeren")).toBeVisible()
  finish?.({ createCloudDeck: deck })
  expect(await screen.findByText("Edgar Markov is toegevoegd")).toBeVisible()
  await user.click(screen.getByRole("button", { name: "Sluiten" }))
  expect(
    await screen.findByRole("heading", { name: "Edgar Markov" }),
  ).toBeVisible()
  expect(screen.getByAltText("Illustratie van Edgar Markov")).toHaveAttribute(
    "src",
    expect.stringContaining("00000000-0000-4000-8000-000000000001"),
  )
  expect(
    screen.getByLabelText("Kleuridentiteit: Wit, Zwart, Rood"),
  ).toBeVisible()
})

test("toont een importfout en kan dezelfde import opnieuw proberen", async () => {
  api.create
    .mockReturnValueOnce(
      rejectedMutation({ data: { code: "DECK_PROVIDER_UNAVAILABLE" } }),
    )
    .mockReturnValueOnce(mutation({ createCloudDeck: deck }))
  const user = userEvent.setup()
  renderWithProviders(
    <DecksScreen auth={signedInAuth()} repository={repository()} />,
  )
  await user.click(
    await screen.findByRole("button", { name: "Deck toevoegen" }),
  )
  await user.click(screen.getByRole("radio", { name: /Archidekt/ }))
  await user.click(screen.getByRole("button", { name: /Verder/ }))
  await user.type(screen.getByLabelText("Archidekt deck-URL"), deck.sourceUrl)
  await user.click(screen.getByRole("button", { name: "Import starten" }))
  expect(await screen.findByText(/tijdelijk niet bereikbaar/)).toBeVisible()
  await user.click(screen.getByRole("button", { name: "Opnieuw proberen" }))
  expect(await screen.findByText("Edgar Markov is toegevoegd")).toBeVisible()
})

test("behoudt deckdata bij updatefout en bevestigt verwijderen", async () => {
  api.update.mockReturnValue(rejectedMutation(new Error("provider down")))
  api.remove.mockReturnValue(mutation({ deleteCloudDeck: true }))
  const user = userEvent.setup()
  renderWithProviders(
    <DecksScreen auth={signedInAuth()} repository={repository([deck])} />,
  )
  expect(
    await screen.findByRole("heading", { name: "Edgar Markov" }),
  ).toBeVisible()
  await user.click(
    screen.getByRole("button", { name: /Edgar Markov bijwerken/ }),
  )
  expect(await screen.findByText(/vorige versie is behouden/)).toBeVisible()
  expect(screen.getByRole("heading", { name: "Edgar Markov" })).toBeVisible()
  await user.click(
    screen.getByRole("button", { name: "Edgar Markov verwijderen" }),
  )
  const confirmation = screen.getByRole("alertdialog")
  expect(within(confirmation).getByText("Deck verwijderen?")).toBeVisible()
  await user.click(
    within(confirmation).getByRole("button", { name: "Verwijderen" }),
  )
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: "Edgar Markov" }),
    ).not.toBeInTheDocument(),
  )
})
