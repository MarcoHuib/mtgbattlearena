import { screen, within } from "@testing-library/react"
import { App } from "../../App"
import { renderWithProviders } from "../../utils/test-utils"
import {
  MockAuthService,
  MockOnlineGameService,
  type ApplicationServices,
} from "./services"
import type { LobbyRoom, OnlineLobby } from "./types"

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

class OfflineOnlineGameService extends MockOnlineGameService {
  override readonly kind = "cloudflare" as const

  override checkHealth(): Promise<never> {
    return Promise.reject(new TypeError("Failed to fetch"))
  }
}

class NetworkFailingAuthService extends MockAuthService {
  signInWithEmail(): Promise<never> {
    return Promise.reject(new TypeError("Load failed"))
  }
}

class HostLobbyOnlineGameService extends MockOnlineGameService {
  private readonly hostLobby: OnlineLobby = {
    id: "host-lobby",
    code: "HOST42",
    title: "Mijn Commander-tafel",
    hostDisplayName: "google-player",
    format: "Commander",
    visibility: "public",
    status: "waiting",
    playerCount: 1,
    maxPlayers: 4,
    createdAt: "2026-07-29T18:00:00.000Z",
    viewerRole: "host",
  }

  listPublicLobbies(): Promise<OnlineLobby[]> {
    return Promise.resolve([this.hostLobby])
  }

  getLobbyRoom(): Promise<LobbyRoom> {
    return Promise.resolve({
      lobby: this.hostLobby,
      participants: [
        {
          displayName: "google-player",
          role: "player",
          seatNumber: 0,
          isHost: true,
          isViewer: true,
          deckReady: false,
          deckName: null,
        },
      ],
    })
  }
}

class ReadyLobbyOnlineGameService extends MockOnlineGameService {
  private hostDeckName: string | null = null

  override abortGame(): Promise<void> {
    return Promise.resolve()
  }

  override getLobbyRoom(): Promise<LobbyRoom> {
    return Promise.resolve({
      lobby: {
        id: "ready-lobby",
        code: "READY2",
        title: "Duel klaarzetten",
        hostDisplayName: "Host",
        format: "Commander",
        visibility: "private",
        status: "waiting",
        playerCount: 2,
        maxPlayers: 2,
        createdAt: "2026-07-29T18:00:00.000Z",
        viewerRole: "host",
      },
      participants: [
        {
          displayName: "Host",
          role: "player",
          seatNumber: 0,
          isHost: true,
          isViewer: true,
          deckReady: this.hostDeckName !== null,
          deckName: this.hostDeckName,
        },
        {
          displayName: "Gast",
          role: "player",
          seatNumber: 1,
          isHost: false,
          isViewer: false,
          deckReady: true,
          deckName: "Gastdeck",
        },
      ],
    })
  }

  override registerDeck(_gameId: string, deckKey: string) {
    this.hostDeckName = deckKey
    return Promise.resolve()
  }

  override startGame() {
    if (!this.hostDeckName) throw new Error("Hostdeck ontbreekt.")
    return Promise.resolve()
  }
}

test("hoofdmenu houdt offline direct beschikbaar en routeert naar online", async () => {
  const services = createServices()
  const { user } = renderWithProviders(<App services={services} />)

  expect(
    await screen.findByRole("heading", {
      name: "Roep je deck bijeen. Begin de battle.",
    }),
  ).toBeInTheDocument()
  expect(screen.getByRole("link", { name: /Offline spelen/ })).toHaveAttribute(
    "href",
    "/offline",
  )
  await user.click(screen.getByRole("link", { name: /Online spelen/ }))
  expect(
    await screen.findByRole("heading", { name: "Online spelen" }),
  ).toBeInTheDocument()
  expect(screen.getByText("Demoarena")).toBeInTheDocument()
  expect(screen.queryByText("Cloudflare verbonden")).not.toBeInTheDocument()
  expect(screen.queryByText("Online verbonden")).not.toBeInTheDocument()
})

test("biedt Google en Microsoft als normale SSO-knoppen aan", async () => {
  window.history.replaceState({}, "", "/online")
  const { user } = renderWithProviders(<App services={createServices()} />)

  await screen.findByRole("heading", { name: "Niet ingelogd" })
  const google = screen.getByRole("button", { name: "Doorgaan met Google" })
  const microsoft = screen.getByRole("button", {
    name: "Doorgaan met Microsoft",
  })
  expect(google).toHaveClass("button--secondary")
  expect(microsoft).toHaveClass("button--secondary")
  expect(google.querySelector("svg.auth-provider-icon")).not.toBeNull()
  expect(microsoft.querySelector("svg.auth-provider-icon")).not.toBeNull()

  await user.click(microsoft)
  expect(
    await screen.findByRole("heading", {
      name: /Ingelogd als microsoft-player/,
    }),
  ).toBeInTheDocument()
})

test("toont auth, 2–6 spelerkeuze en opent een aparte hostwachtkamer", async () => {
  const services = createServices()
  window.history.replaceState({}, "", "/online")
  const { user } = renderWithProviders(<App services={services} />)

  expect(
    await screen.findByRole("heading", { name: "Niet ingelogd" }),
  ).toBeInTheDocument()
  expect(await screen.findByText("Casual Commander")).toBeInTheDocument()
  expect(screen.queryByLabelText("Aantal spelers")).not.toBeInTheDocument()
  expect(screen.queryByLabelText("Gamecode")).not.toBeInTheDocument()

  await user.type(screen.getByLabelText("E-mailadres"), "player@example.com")
  await user.type(screen.getByLabelText("Wachtwoord"), "veilig-wachtwoord")
  await user.click(screen.getByRole("button", { name: "Inloggen" }))
  expect(
    await screen.findByRole("heading", { name: /Ingelogd als player/ }),
  ).toBeInTheDocument()

  const playerCount = screen.getByLabelText("Aantal spelers")
  expect(
    within(playerCount)
      .getAllByRole("option")
      .map(option => option.textContent),
  ).toEqual(["2", "3", "4 (Commander-standaard)", "5", "6"])

  await user.clear(screen.getByLabelText("Naam"))
  await user.type(screen.getByLabelText("Naam"), "Zes spelers test")
  await user.selectOptions(playerCount, "6")
  await user.click(screen.getByRole("button", { name: "Lobby maken" }))
  expect(
    await screen.findByRole("heading", { name: "Zes spelers test" }),
  ).toBeInTheDocument()
  expect(await screen.findByText("1/6 seats bezet")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Battle starten" })).toBeDisabled()

  await user.click(screen.getByRole("button", { name: "Lobby verwijderen" }))
  await user.click(screen.getByRole("button", { name: "Ja, verwijderen" }))
  expect(
    await screen.findByRole("heading", { name: "Online spelen" }),
  ).toBeInTheDocument()
})

test("neemt met een gamecode deel en opent de wachtkamer", async () => {
  const services = createServices()
  window.history.replaceState({}, "", "/online")
  const { user } = renderWithProviders(<App services={services} />)

  await screen.findByRole("heading", { name: "Niet ingelogd" })
  await user.click(screen.getByRole("button", { name: "Doorgaan met Google" }))
  await screen.findByRole("heading", { name: /Ingelogd als google-player/ })
  await user.type(screen.getByLabelText("Gamecode"), "BATTLE")
  await user.click(screen.getByRole("button", { name: "Deelnemen" }))

  expect(
    await screen.findByRole("heading", { name: "Casual Commander" }),
  ).toBeInTheDocument()
  expect(await screen.findByText("Wachten op de groep")).toBeInTheDocument()
  expect(
    screen.queryByRole("button", { name: "Lobby verwijderen" }),
  ).not.toBeInTheDocument()
})

test("herkent de ingelogde host en opent geen ongeïnitialiseerde game", async () => {
  window.history.replaceState({}, "", "/online")
  const auth = new MockAuthService()
  const { user } = renderWithProviders(
    <App
      services={{
        auth,
        onlineGames: new HostLobbyOnlineGameService(),
      }}
    />,
  )

  await screen.findByRole("heading", { name: "Niet ingelogd" })
  expect(
    screen.queryByRole("button", { name: /Mijn Commander-tafel/ }),
  ).not.toBeInTheDocument()

  await user.click(screen.getByRole("button", { name: "Doorgaan met Google" }))
  await screen.findByRole("heading", { name: /Ingelogd als google-player/ })

  expect(await screen.findByText("Jij bent host")).toBeInTheDocument()
  await user.click(
    screen.getByRole("button", {
      name: "Lobby beheren: Mijn Commander-tafel",
    }),
  )

  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "Mijn Commander-tafel",
    }),
  ).toBeInTheDocument()
  expect(screen.getByText("HOST42")).toBeInTheDocument()
  expect(screen.getByText("1/4 seats bezet")).toBeInTheDocument()
  expect(
    screen.getByRole("button", { name: "Lobby verwijderen" }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole("heading", { name: "Online battle" }),
  ).not.toBeInTheDocument()
})

test("toont een bruikbare mobiele netwerkfout bij inloggen", async () => {
  window.history.replaceState({}, "", "/online")
  const { user } = renderWithProviders(
    <App
      services={{
        auth: new NetworkFailingAuthService(),
        onlineGames: new EmptyOnlineGameService(),
      }}
    />,
  )

  await screen.findByRole("heading", { name: "Niet ingelogd" })
  await user.type(screen.getByLabelText("E-mailadres"), "player@example.com")
  await user.type(screen.getByLabelText("Wachtwoord"), "veilig-wachtwoord")
  await user.click(screen.getByRole("button", { name: "Inloggen" }))

  expect(
    await screen.findByText(
      "Firebase kon niet worden bereikt. Controleer je verbinding en probeer opnieuw.",
    ),
  ).toBeInTheDocument()
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

test("toont serverstatus alleen in de hoofdbalk en blokkeert online acties bij uitval", async () => {
  window.history.replaceState({}, "", "/online")
  const auth = new MockAuthService()

  renderWithProviders(
    <App
      services={{
        auth,
        onlineGames: new OfflineOnlineGameService(),
      }}
    />,
  )

  expect(await screen.findByText("Arena offline")).toBeInTheDocument()
  expect(
    screen.getByRole("heading", {
      name: "De online arena is tijdelijk offline.",
    }),
  ).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Offline spelen" })).toHaveAttribute(
    "href",
    "/offline",
  )
  expect(
    screen.queryByRole("button", { name: "Doorgaan met Google" }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole("button", { name: "Lobby maken" }),
  ).not.toBeInTheDocument()
  expect(screen.queryByText("Cloudflare verbonden")).not.toBeInTheDocument()
})

test("lobby zonder clouddecks verwijst naar de Deck Library en bevat geen import of delete", async () => {
  window.history.replaceState({}, "", "/online/lobby/ready-lobby")
  renderWithProviders(
    <App
      services={{
        auth: new MockAuthService(),
        onlineGames: new ReadyLobbyOnlineGameService(),
      }}
    />,
  )
  expect(await screen.findByLabelText("Opgeslagen deck")).toBeInTheDocument()
  expect(
    screen.getByRole("link", { name: /Voeg eerst een deck toe/ }),
  ).toHaveAttribute("href", "/decks")
  expect(
    screen.queryByLabelText("Openbare Archidekt-URL"),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole("button", { name: /Uit lijst verwijderen/ }),
  ).not.toBeInTheDocument()
})
