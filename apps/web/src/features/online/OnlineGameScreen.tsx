import {
  gameCommandSchema,
  type GameCommand,
  type OnlineTokenDefinition,
} from "@mtg/game-protocol"
import { useCallback, useEffect, useRef, useState } from "react"
import { useAppDispatch, useAppSelector } from "../../app/hooks"
import { AppLink, navigate } from "../../app/router"
import { Brand } from "../../components/Brand"
import { StatusBar } from "../../components/StatusBar"
import { repositories } from "../../persistence/database"
import { BattleRuntimeProvider } from "../battle/BattleRuntime"
import { BattleTable } from "../battle/BattleTable"
import {
  beginOnlineConnection,
  clearOnlineGame,
  queueOnlineCommand,
  receiveOnlineEvent,
  setOnlineConnectionError,
  setOnlineConnectionStatus,
} from "./onlineSlice"
import { useOnlineBattleRuntime } from "./onlineBattleRuntime"
import type { OnlineGameConnection, OnlineGameService } from "./types"

type OnlineGameScreenProps = {
  gameId: string
  onlineGames: OnlineGameService
}

export const OnlineGameScreen = ({
  gameId,
  onlineGames,
}: OnlineGameScreenProps) => {
  const dispatch = useAppDispatch()
  const online = useAppSelector(state => state.online)
  const connectionRef = useRef<OnlineGameConnection | null>(null)
  const [confirmAbort, setConfirmAbort] = useState(false)
  const [aborting, setAborting] = useState(false)
  const [abortError, setAbortError] = useState<string | null>(null)
  const [localTokens, setLocalTokens] = useState<OnlineTokenDefinition[]>([])

  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined
    dispatch(beginOnlineConnection(gameId))
    void onlineGames
      .connectGame(gameId)
      .then(connection => {
        if (disposed) {
          connection.close()
          return
        }
        connectionRef.current = connection
        unsubscribe = connection.subscribe(update => {
          if (update.type === "event") {
            if (update.event.type === "GAME_ABORTED") {
              connection.close()
              navigate("/online", true)
              return
            }
            dispatch(receiveOnlineEvent(update.event))
            return
          }
          dispatch(setOnlineConnectionStatus(update.status))
          if (update.status === "error") {
            dispatch(
              setOnlineConnectionError({
                code: "INTERNAL_ERROR",
                message: update.message ?? "De online verbinding is verbroken.",
                retryable: true,
              }),
            )
          }
        })
      })
      .catch((error: unknown) => {
        dispatch(
          setOnlineConnectionError({
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error
                ? error.message
                : "De online game kon niet worden verbonden.",
            retryable: true,
          }),
        )
      })

    return () => {
      disposed = true
      unsubscribe?.()
      connectionRef.current?.close()
      connectionRef.current = null
      dispatch(clearOnlineGame())
    }
  }, [dispatch, gameId, onlineGames])

  const sendCommand = useCallback(
    (type: GameCommand["type"], payload: unknown) => {
      const view = online.view
      const connection = connectionRef.current
      if (!view || !connection) return
      const command = gameCommandSchema.parse({
        type,
        commandId: crypto.randomUUID(),
        expectedVersion: view.version,
        payload,
      })
      dispatch(queueOnlineCommand(command.commandId))
      try {
        connection.send(command)
      } catch (error) {
        dispatch(
          setOnlineConnectionError({
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error
                ? error.message
                : "Command versturen is mislukt.",
            retryable: true,
          }),
        )
      }
    },
    [dispatch, online.view],
  )

  const deckSnapshotId = online.view?.privateView?.deckSnapshotId
  const hasServerTokens =
    (online.view?.privateView?.availableTokens.length ?? 0) > 0
  useEffect(() => {
    let active = true
    if (!deckSnapshotId || hasServerTokens) {
      setLocalTokens([])
      return () => {
        active = false
      }
    }
    void repositories.decks.get(deckSnapshotId).then(deck => {
      if (!active || !deck) return
      setLocalTokens(
        deck.definitions
          .filter(definition => definition.token?.source === "deck")
          .map(definition => ({
            definitionId: definition.id,
            name: definition.name,
            typeLine: definition.typeLine,
            imageUrl:
              definition.faces[0]?.imageUrl ?? definition.imageRefs[0]?.url,
            scryfallId: definition.scryfallId,
            kind: definition.token?.kind ?? "other",
            power: definition.token?.power,
            toughness: definition.token?.toughness,
          })),
      )
    })
    return () => {
      active = false
    }
  }, [deckSnapshotId, hasServerTokens])

  const runtime = useOnlineBattleRuntime(
    online.view,
    online.connectionStatus !== "connected" ||
      online.pendingCommandIds.length > 0,
    sendCommand,
    localTokens,
  )

  const abortGame = async () => {
    setAborting(true)
    setAbortError(null)
    try {
      await onlineGames.abortGame(gameId)
      connectionRef.current?.close()
      navigate("/online", true)
    } catch (error) {
      setAbortError(
        error instanceof Error
          ? error.message
          : "De game kon niet worden afgebroken.",
      )
      setAborting(false)
    }
  }

  return (
    <main className="battle-screen online-battle-screen">
      <header className="battle-header">
        <AppLink to="/" className="brand-link">
          <Brand />
        </AppLink>
        <div className="battle-title">
          <span className="eyebrow">Online battle</span>
          <strong>{runtime?.game.title ?? `Game ${gameId}`}</strong>
        </div>
        <StatusBar
          onlineStateLabel={
            online.view
              ? `Serverstate v${online.view.version}`
              : `Verbinding ${online.connectionStatus}`
          }
        />
        <nav className="battle-actions" aria-label="Online battleacties">
          <button
            className="button button--ghost"
            type="button"
            onClick={() => {
              connectionRef.current?.reconnect()
            }}
          >
            Opnieuw verbinden
          </button>
          <AppLink to="/online" className="button button--ghost">
            Lobby’s
          </AppLink>
          {online.view?.isHost ? (
            <button
              className="lobby-delete-button"
              type="button"
              onClick={() => {
                setAbortError(null)
                setConfirmAbort(true)
              }}
            >
              Spel afbreken
            </button>
          ) : null}
        </nav>
      </header>

      {online.lastError ? (
        <p className="online-message online-game-error" role="alert">
          {online.lastError.message}
          {online.lastError.code === "VERSION_CONFLICT"
            ? " De persoonlijke state is opnieuw gesynchroniseerd."
            : ""}
        </p>
      ) : null}

      {!runtime ? (
        <div className="empty-state online-game-loading" aria-live="polite">
          <strong>Persoonlijke snapshot laden…</strong>
          <span>
            Verbinding {online.connectionStatus}. Verborgen kaarten worden
            uitsluitend in jouw persoonlijke view geladen.
          </span>
        </div>
      ) : (
        <BattleRuntimeProvider runtime={runtime}>
          {online.view?.role === "spectator" ? (
            <p className="online-spectator-note">
              Spectatormodus: je ziet uitsluitend publieke informatie.
            </p>
          ) : null}
          <BattleTable />
        </BattleRuntimeProvider>
      )}

      {confirmAbort ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="abort-game-title"
          >
            <span className="eyebrow">Online game beëindigen</span>
            <h2 id="abort-game-title">Spel voor iedereen afbreken?</h2>
            <p>
              Alle spelers verlaten deze battle. Dit kan niet ongedaan worden
              gemaakt.
            </p>
            {abortError ? <p role="alert">{abortError}</p> : null}
            <div>
              <button
                className="button button--secondary"
                type="button"
                disabled={aborting}
                onClick={() => {
                  setConfirmAbort(false)
                }}
              >
                Annuleren
              </button>
              <button
                className="lobby-delete-button"
                type="button"
                disabled={aborting}
                onClick={() => void abortGame()}
              >
                {aborting ? "Afbreken…" : "Ja, spel afbreken"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}
