import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type SyntheticEvent,
} from "react"
import { AppLink } from "../../app/router"
import { AppShell } from "../../components/AppShell"
import type {
  AuthService,
  CreateLobbyInput,
  OnlineGameService,
  OnlineLobby,
} from "./types"
import { describeFirebaseAuthError } from "./firebaseAuth"
import { useArenaStatus } from "./ArenaStatus"
import { AuthProviderIcon } from "./AuthProviderIcon"

type OnlineScreenProps = {
  auth: AuthService
  onlineGames: OnlineGameService
  onEnterGame: (gameId: string) => void
  onEnterLobby: (gameId: string) => void
}

const useAuthState = (auth: AuthService) =>
  useSyncExternalStore(
    listener => auth.subscribe(listener),
    () => auth.getState(),
    () => auth.getState(),
  )

const LobbyCard = ({
  lobby,
  signedIn,
  onOpen,
}: {
  lobby: OnlineLobby
  signedIn: boolean
  onOpen: (lobby: OnlineLobby) => void
}) => {
  const actionLabel =
    lobby.status === "active"
      ? "Battle openen"
      : lobby.viewerRole === "host"
        ? "Lobby beheren"
        : lobby.viewerRole
          ? "Lobby openen"
          : "Deelnemen"

  return (
    <article className="lobby-card">
      <div>
        <div className="lobby-card__badges">
          <span className="mode-badge">{lobby.visibility}</span>
          {lobby.viewerRole === "host" ? (
            <span className="mode-badge mode-badge--host">Jij bent host</span>
          ) : lobby.viewerRole ? (
            <span className="mode-badge">Aangemeld</span>
          ) : null}
        </div>
        <h3>{lobby.title}</h3>
        <p>
          Host {lobby.hostDisplayName} · {lobby.format}
        </p>
      </div>
      <div className="lobby-card__capacity">
        <strong>
          {lobby.playerCount}/{lobby.maxPlayers}
        </strong>
        <span>spelers</span>
      </div>
      {signedIn ? (
        <button
          className="button button--secondary"
          type="button"
          aria-label={`${actionLabel}: ${lobby.title}`}
          disabled={
            lobby.status === "active"
              ? !lobby.viewerRole
              : !lobby.viewerRole && lobby.playerCount >= lobby.maxPlayers
          }
          onClick={() => {
            onOpen(lobby)
          }}
        >
          {actionLabel}
        </button>
      ) : null}
    </article>
  )
}

export const OnlineScreen = ({
  auth,
  onlineGames,
  onEnterGame,
  onEnterLobby,
}: OnlineScreenProps) => {
  const authState = useAuthState(auth)
  const arena = useArenaStatus()
  const arenaAvailable = arena.status === "online" || arena.status === "demo"
  const [lobbies, setLobbies] = useState<OnlineLobby[]>([])
  const [lobbyStatus, setLobbyStatus] = useState<
    "loading" | "ready" | "empty" | "error"
  >("loading")
  const [lobbyError, setLobbyError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [authenticating, setAuthenticating] = useState(false)
  const [joinCode, setJoinCode] = useState("")
  const [creating, setCreating] = useState(false)
  const [createInput, setCreateInput] = useState<CreateLobbyInput>({
    title: "Commander aan de keukentafel",
    format: "Commander",
    visibility: "public",
    maxPlayers: 4,
  })

  const loadLobbies = useCallback(
    async (signal?: AbortSignal) => {
      setLobbyStatus("loading")
      setLobbyError(null)
      try {
        const result = await onlineGames.listPublicLobbies(signal)
        setLobbies(result)
        setLobbyStatus(result.length ? "ready" : "empty")
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        setLobbyStatus("error")
        setLobbyError(
          error instanceof TypeError ||
            (error instanceof Error &&
              /load failed|failed to fetch|networkerror/i.test(error.message))
            ? "De online arena reageert niet. Controleer je verbinding en probeer opnieuw."
            : error instanceof Error
              ? error.message
              : "Lobby’s laden is mislukt.",
        )
      }
    },
    [onlineGames],
  )

  useEffect(() => {
    if (!arenaAvailable) return
    const controller = new AbortController()
    void loadLobbies(controller.signal)
    return () => {
      controller.abort()
    }
  }, [arenaAvailable, authState.status, loadLobbies])

  const ensureSignedIn = () => {
    if (!arenaAvailable) {
      setMessage("De online arena is momenteel niet bereikbaar.")
      return false
    }
    if (authState.status !== "signed-in") {
      setMessage("Log eerst in om een lobby te maken of deel te nemen.")
      return false
    }
    return true
  }

  const runAuth = async (action: () => Promise<unknown>) => {
    setAuthenticating(true)
    setMessage(null)
    try {
      await action()
    } catch (error) {
      setMessage(describeFirebaseAuthError(error))
    } finally {
      setAuthenticating(false)
    }
  }

  const submitEmailLogin = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    void runAuth(() => auth.signInWithEmail(email.trim(), password))
  }

  const join = async (code: string) => {
    if (!ensureSignedIn()) return
    setMessage("Deelnemen…")
    try {
      const result = await onlineGames.joinByCode(code)
      if (result.lobby.status === "active") {
        onEnterGame(result.gameId)
      } else {
        onEnterLobby(result.gameId)
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Deelnemen is mislukt.",
      )
    }
  }

  const submitJoin = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    void join(joinCode)
  }

  const openLobby = (lobby: OnlineLobby) => {
    if (!ensureSignedIn()) return
    if (lobby.status === "active") {
      onEnterGame(lobby.id)
      return
    }
    if (lobby.viewerRole) {
      onEnterLobby(lobby.id)
      return
    }
    void join(lobby.code)
  }

  const createLobby = async () => {
    if (!ensureSignedIn()) return
    setCreating(true)
    setMessage("Lobby maken…")
    try {
      const lobby = await onlineGames.createLobby(createInput)
      if (lobby.status === "active") {
        onEnterGame(lobby.id)
      } else {
        onEnterLobby(lobby.id)
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Lobby maken is mislukt.",
      )
    } finally {
      setCreating(false)
    }
  }

  const submitCreate = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    void createLobby()
  }

  return (
    <AppShell activeRoute="/online">
      <section className="content-page online-page">
        <div className="online-heading online-hero">
          <div className="online-hero__copy">
            <span className="eyebrow">Server-authoritative multiplayer</span>
            <h1>Online spelen</h1>
            <p>
              Verzamel je tafel, kies je deck en speel samen in één gedeelde
              arena. Jouw verborgen kaarten blijven alleen van jou.
            </p>
          </div>
        </div>

        {!arenaAvailable ? (
          <section
            className={`arena-unavailable arena-unavailable--${arena.status}`}
            role={arena.status === "offline" ? "alert" : "status"}
            aria-live="polite"
          >
            <span className="arena-unavailable__icon" aria-hidden="true">
              {arena.status === "checking" ? "◌" : "!"}
            </span>
            <div>
              <span className="eyebrow">
                {arena.status === "checking"
                  ? "Verbinding controleren"
                  : "Online modus niet beschikbaar"}
              </span>
              <h2>
                {arena.status === "checking"
                  ? "Arena wordt gecontroleerd…"
                  : "De online arena is tijdelijk offline."}
              </h2>
              <p>
                {arena.status === "checking"
                  ? "Een ogenblik; de serverstatus verschijnt in de hoofdbalk."
                  : `${arena.message} Je lokale battles en decks blijven gewoon beschikbaar.`}
              </p>
            </div>
            <div className="arena-unavailable__actions">
              <button
                className="button button--secondary"
                type="button"
                disabled={arena.status === "checking"}
                onClick={() => {
                  void arena.retry()
                }}
              >
                Opnieuw controleren
              </button>
              <AppLink to="/offline" className="button button--primary">
                Offline spelen
              </AppLink>
            </div>
          </section>
        ) : (
          <>
            <section className="auth-panel" aria-labelledby="loginstatus-title">
              <div className="auth-panel__intro">
                <span className="auth-panel__rune" aria-hidden="true">
                  ✦
                </span>
                <span className="eyebrow">Loginstatus</span>
                <h2 id="loginstatus-title">
                  {authState.status === "signed-in"
                    ? `Ingelogd als ${authState.user.displayName}`
                    : authState.status === "loading"
                      ? "Login controleren…"
                      : authState.status === "error"
                        ? "Loginconfiguratie ontbreekt"
                        : "Niet ingelogd"}
                </h2>
                <p>
                  {authState.status === "signed-in"
                    ? "Je identiteit is bevestigd. De arena staat voor je klaar."
                    : "Log in om een tafel te maken, een gamecode te gebruiken en later je battle te hervatten."}
                </p>
              </div>
              {authState.status === "signed-in" ? (
                <div className="auth-panel__signed-in">
                  <span className="auth-panel__avatar" aria-hidden="true">
                    {authState.user.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{authState.user.displayName}</strong>
                    <small>Geverifieerde speler</small>
                  </div>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => {
                      void auth.signOut()
                    }}
                  >
                    Uitloggen
                  </button>
                </div>
              ) : (
                <form className="auth-login-form" onSubmit={submitEmailLogin}>
                  <div className="auth-login-form__fields">
                    <label>
                      <span>E-mailadres</span>
                      <input
                        type="email"
                        value={email}
                        autoComplete="email"
                        inputMode="email"
                        placeholder="jij@voorbeeld.nl"
                        required
                        onChange={event => {
                          setEmail(event.target.value)
                        }}
                      />
                    </label>
                    <label>
                      <span>Wachtwoord</span>
                      <input
                        type="password"
                        value={password}
                        minLength={6}
                        autoComplete="current-password"
                        placeholder="Minimaal 6 tekens"
                        required
                        onChange={event => {
                          setPassword(event.target.value)
                        }}
                      />
                    </label>
                  </div>
                  <div className="auth-login-form__actions">
                    <button
                      className="button button--primary"
                      type="submit"
                      disabled={
                        authenticating ||
                        authState.status === "loading" ||
                        authState.status === "error"
                      }
                    >
                      {authenticating ? "Even wachten…" : "Inloggen"}
                    </button>
                    <button
                      className="button button--secondary"
                      type="button"
                      disabled={
                        authenticating ||
                        authState.status === "loading" ||
                        authState.status === "error" ||
                        !email.trim() ||
                        password.length < 6
                      }
                      onClick={() => {
                        void runAuth(() =>
                          auth.registerWithEmail(email.trim(), password),
                        )
                      }}
                    >
                      Account maken
                    </button>
                    <span className="auth-login-form__divider">of</span>
                    <button
                      className="button button--secondary"
                      type="button"
                      disabled={
                        authenticating ||
                        authState.status === "loading" ||
                        authState.status === "error"
                      }
                      onClick={() => {
                        void runAuth(() => auth.signInWithGoogle())
                      }}
                    >
                      <AuthProviderIcon provider="google" />
                      Doorgaan met Google
                    </button>
                    <button
                      className="button button--secondary"
                      type="button"
                      disabled={
                        authenticating ||
                        authState.status === "loading" ||
                        authState.status === "error"
                      }
                      onClick={() => {
                        void runAuth(() => auth.signInWithMicrosoft())
                      }}
                    >
                      <AuthProviderIcon provider="microsoft" />
                      Doorgaan met Microsoft
                    </button>
                  </div>
                </form>
              )}
              {authState.status === "error" ? (
                <p className="auth-panel__error" role="alert">
                  {authState.message}
                </p>
              ) : null}
            </section>

            {authState.status === "signed-in" ? (
              <div className="online-actions-grid">
                <form
                  className="content-card online-form"
                  onSubmit={submitJoin}
                >
                  <span className="eyebrow">Uitnodiging</span>
                  <h2>Deelnemen met code</h2>
                  <label>
                    Gamecode
                    <input
                      value={joinCode}
                      maxLength={12}
                      autoComplete="off"
                      placeholder="BATTLE"
                      onChange={event => {
                        setJoinCode(event.target.value.toUpperCase())
                      }}
                    />
                  </label>
                  <button
                    className="button button--primary"
                    type="submit"
                    disabled={!joinCode.trim()}
                  >
                    Deelnemen
                  </button>
                </form>

                <form
                  className="content-card online-form"
                  onSubmit={submitCreate}
                >
                  <span className="eyebrow">Nieuwe tafel</span>
                  <h2>Game aanmaken</h2>
                  <label>
                    Naam
                    <input
                      value={createInput.title}
                      maxLength={100}
                      onChange={event => {
                        setCreateInput(current => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }}
                    />
                  </label>
                  <label>
                    Aantal spelers
                    <select
                      value={createInput.maxPlayers}
                      onChange={event => {
                        setCreateInput(current => ({
                          ...current,
                          maxPlayers: Number(event.target.value),
                        }))
                      }}
                    >
                      {[2, 3, 4, 5, 6].map(count => (
                        <option key={count} value={count}>
                          {count}
                          {count === 4 ? " (Commander-standaard)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Zichtbaarheid
                    <select
                      value={createInput.visibility}
                      onChange={event => {
                        const visibility = event.target
                          .value as CreateLobbyInput["visibility"]
                        setCreateInput(current => ({ ...current, visibility }))
                      }}
                    >
                      <option value="public">Openbaar</option>
                      <option value="private">Privé</option>
                      <option value="invite-only">Alleen uitnodiging</option>
                    </select>
                  </label>
                  <button
                    className="button button--primary"
                    type="submit"
                    disabled={creating || !createInput.title.trim()}
                  >
                    {creating ? "Maken…" : "Lobby maken"}
                  </button>
                </form>
              </div>
            ) : null}

            {message ? (
              <p className="online-message" role="status" aria-live="polite">
                {message}
              </p>
            ) : null}

            <section
              className="lobby-section"
              aria-labelledby="public-lobbies-title"
            >
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Openbare tafels</span>
                  <h2 id="public-lobbies-title">Lobby’s</h2>
                </div>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => {
                    void loadLobbies()
                  }}
                >
                  Vernieuwen
                </button>
              </div>
              {lobbyStatus === "loading" ? (
                <p aria-live="polite">Lobby’s laden…</p>
              ) : lobbyStatus === "error" ? (
                <div className="empty-state" role="alert">
                  <strong>Lobby’s konden niet worden geladen.</strong>
                  {lobbyError ? <span>{lobbyError}</span> : null}
                  <span>Offline spelen blijft volledig beschikbaar.</span>
                </div>
              ) : lobbyStatus === "empty" ? (
                <div className="empty-state">
                  <strong>Er zijn nog geen openbare lobby’s.</strong>
                  <span>Maak de eerste tafel of neem deel met een code.</span>
                </div>
              ) : (
                <div className="lobby-list">
                  {lobbies.map(lobby => (
                    <LobbyCard
                      key={lobby.id}
                      lobby={lobby}
                      signedIn={authState.status === "signed-in"}
                      onOpen={openLobby}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </section>
    </AppShell>
  )
}
