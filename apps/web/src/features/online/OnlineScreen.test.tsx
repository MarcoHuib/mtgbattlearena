import { screen, waitFor, within } from "@testing-library/react"
import { App } from "../../App"
import { renderWithProviders } from "../../utils/test-utils"
import {
  MockAuthService,
  MockOnlineGameService,
  type ApplicationServices,
} from "./services"
import type { OnlineLobby } from "./types"

beforeEach(() => {
  window.history.replaceState({}, "", "/")
})

const createServices = (): ApplicationServices => ({
  auth: new MockAuthService(),
  onlineGames: new MockOnlineGameService(),
})

class EmptyOnlineGameService extends MockOnlineGameService {
  listPublicLobbies(): Promise<OnlineLobby[]> {
    return Promise.resolve([])
  }
}

class FailingOnlineGameService extends MockOnlineGameService {
  listPublicLobbies(): Promise<OnlineLobby[]> {
    return Promise.reject(new Error("Backend niet geconfigureerd"))
  }
}

test("hoofdmenu houdt offline direct beschikbaar en routeert naar online", async () => {
  const services = createServices()
  const { user } = renderWithProviders(<App services={services} />)

  expect(
    await screen.findByRole("heading", { name: "Kies hoe je wilt spelen." }),
  ).toBeInTheDocument()
  expect(screen.getByRole("link", { name: /Offline spelen/ })).toHaveAttribute(
    "href",
    "/offline",
  )
  await user.click(screen.getByRole("link", { name: /Online spelen/ }))
  expect(
    await screen.findByRole("heading", { name: "Online spelen" }),
  ).toBeInTheDocument()
  expect(screen.getByText("Demobackend")).toBeInTheDocument()
})

test("toont auth, 2–6 spelerkeuze en opent een speelbare mockgame", async () => {
  const services = createServices()
  window.history.replaceState({}, "", "/online")
  const { user } = renderWithProviders(<App services={services} />)

  expect(
    await screen.findByRole("heading", { name: "Niet ingelogd" }),
  ).toBeInTheDocument()
  expect(await screen.findByText("Casual Commander")).toBeInTheDocument()

  const playerCount = screen.getByLabelText("Aantal spelers")
  expect(
    within(playerCount)
      .getAllByRole("option")
      .map(option => option.textContent),
  ).toEqual(["2", "3", "4 (Commander-standaard)", "5", "6"])

  await user.click(screen.getByRole("button", { name: "Anoniem inloggen" }))
  expect(
    await screen.findByRole("heading", { name: /Ingelogd als Planeswalker/ }),
  ).toBeInTheDocument()

  await user.clear(screen.getByLabelText("Naam"))
  await user.type(screen.getByLabelText("Naam"), "Zes spelers test")
  await user.selectOptions(playerCount, "6")
  await user.click(screen.getByRole("button", { name: "Lobby maken" }))
  expect(
    await screen.findByRole("heading", { name: "Online battle" }),
  ).toBeInTheDocument()
  expect(await screen.findByText("Demo kaart 1")).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Leven −1" }))
  await waitFor(() =>
    expect(
      within(screen.getByLabelText("Online speelveld van Jij")).getByText("39"),
    ).toBeInTheDocument(),
  )
})

test("neemt met een gamecode deel en opent de persoonlijke gameview", async () => {
  const services = createServices()
  window.history.replaceState({}, "", "/online")
  const { user } = renderWithProviders(<App services={services} />)

  await screen.findByRole("heading", { name: "Niet ingelogd" })
  await user.click(screen.getByRole("button", { name: "Anoniem inloggen" }))
  await screen.findByRole("heading", { name: /Ingelogd als Planeswalker/ })
  await user.type(screen.getByLabelText("Gamecode"), "BATTLE")
  await user.click(screen.getByRole("button", { name: "Deelnemen" }))

  expect(
    await screen.findByRole("heading", { name: "Online battle" }),
  ).toBeInTheDocument()
  expect(await screen.findByText("Demo kaart 1")).toBeInTheDocument()
})

test("toont afzonderlijke lege en foutstatussen zonder offline te blokkeren", async () => {
  window.history.replaceState({}, "", "/online")
  const auth = new MockAuthService()
  const empty = renderWithProviders(
    <App services={{ auth, onlineGames: new EmptyOnlineGameService() }} />,
  )
  expect(
    await screen.findByText("Er zijn nog geen openbare lobby’s."),
  ).toBeInTheDocument()
  empty.unmount()

  renderWithProviders(
    <App services={{ auth, onlineGames: new FailingOnlineGameService() }} />,
  )
  expect(
    await screen.findByText("Lobby’s konden niet worden geladen."),
  ).toBeInTheDocument()
  expect(
    screen.getByText("Offline spelen blijft volledig beschikbaar."),
  ).toBeInTheDocument()
})
