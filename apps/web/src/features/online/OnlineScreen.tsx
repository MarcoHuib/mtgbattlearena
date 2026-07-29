import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type SyntheticEvent,
} from "react"
import { AppShell } from "../../components/AppShell"
import type {
  AuthService,
  CreateLobbyInput,
  OnlineGameService,
  OnlineLobby,
} from "./types"

type OnlineScreenProps = {
  auth: AuthService
  onlineGames: OnlineGameService
  onEnterGame: (gameId: string) => void
}

const useAuthState = (auth: AuthService) =>
  useSyncExternalStore(
    listener => auth.subscribe(listener),
    () => auth.getState(),
    () => auth.getState(),
  )

const LobbyCard = ({
  lobby,
  onJoin,
}: {
  lobby: OnlineLobby
  onJoin: (code: string) => void
}) => (
  <article className="lobby-card">
    <div>
      <span className="mode-badge">{lobby.visibility}</span>
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
    <button
      className="button button--secondary"
      type="button"
      aria-label={`Deelnemen aan ${lobby.title}`}
      disabled={
        lobby.status !== "waiting" || lobby.playerCount >= lobby.maxPlayers
      }
      onClick={() => {
        onJoin(lobby.code)
      }}
    >
      Deelnemen
    </button>
  </article>
)

export const OnlineScreen = ({
  auth,
  onlineGames,
  onEnterGame,
}: OnlineScreenProps) => {
  const authState = useAuthState(auth)
  const [lobbies, setLobbies] = useState<OnlineLobby[]>([])
  const [lobbyStatus, setLobbyStatus] = useState<
    "loading" | "ready" | "empty" | "error"
  >("loading")
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
      try {
        const result = await onlineGames.listPublicLobbies(signal)
        setLobbies(result)
        setLobbyStatus(result.length ? "ready" : "empty")
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        setLobbyStatus("error")
        setMessage(
          error instanceof Error ? error.message : "Lobby’s laden is mislukt.",
        )
      }
    },
    [onlineGames],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadLobbies(controller.signal)
    return () => {
      controller.abort()
    }
  }, [loadLobbies])

  const ensureSignedIn = () => {
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
      setMessage(
        error instanceof Error ? error.message : "Inloggen is mislukt.",
      )
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
      setMessage(`Verbonden met ${result.lobby.title} als ${result.role}.`)
      onEnterGame(result.gameId)
      await loadLobbies()
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

  const createLobby = async () => {
    if (!ensureSignedIn()) return
    setCreating(true)
    setMessage("Lobby maken…")
    try {
      const lobby = await onlineGames.createLobby(createInput)
      setMessage(`Lobby ${lobby.title} is gemaakt met code ${lobby.code}.`)
      onEnterGame(lobby.id)
      await loadLobbies()
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
        <div className="online-heading">
          <div>
            <span className="eyebrow">Server-authoritative multiplayer</span>
            <h1>Online spelen</h1>
            <p>
              Iedere speler ontvangt alleen publieke staat en de eigen verborgen
              kaarten. Offline spelen blijft onafhankelijk beschikbaar.
            </p>
          </div>
          <div className="connection-card">
            <span
              className={`status-dot ${
                onlineGames.kind === "mock" ? "is-mock" : "is-online"
              }`}
              aria-hidden="true"
            />
            <strong>
              {onlineGames.kind === "mock"
                ? "Demobackend"
                : "Cloudflare verbonden"}
            </strong>
            <small>
              {onlineGames.kind === "mock"
                ? "Realistische lokale fixtures; geen secrets nodig"
                : "HTTP-adapter actief"}
            </small>
          </div>
        </div>

        <section className="auth-panel" aria-labelledby="loginstatus-title">
          <div>
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
          </div>
          {authState.status === "signed-in" ? (
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                void auth.signOut()
              }}
            >
              Uitloggen
            </button>
          ) : (
            <form className="auth-login-form" onSubmit={submitEmailLogin}>
              <label>
                E-mailadres
                <input
                  type="email"
                  value={email}
                  autoComplete="email"
                  required
                  onChange={event => {
                    setEmail(event.target.value)
                  }}
                />
              </label>
              <label>
                Wachtwoord
                <input
                  type="password"
                  value={password}
                  minLength={6}
                  autoComplete="current-password"
                  required
                  onChange={event => {
                    setPassword(event.target.value)
                  }}
                />
              </label>
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
                  Inloggen
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
                  Doorgaan met Google
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

        <div className="online-actions-grid">
          <form className="content-card online-form" onSubmit={submitJoin}>
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

          <form className="content-card online-form" onSubmit={submitCreate}>
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
                  onJoin={code => {
                    void join(code)
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </section>
    </AppShell>
  )
}
