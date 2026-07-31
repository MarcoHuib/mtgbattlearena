import { useEffect, useRef, useState } from "react"
import type { PlayerId } from "@mtg/game-core/types"
import { canControlPlayer, useBattleRuntime } from "./BattleRuntime"

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? "")
    .join("")

const useAnimatedRoll = (value: number | undefined, delay: number) => {
  const [displayValue, setDisplayValue] = useState<number | undefined>(value)
  const [rolling, setRolling] = useState(false)

  useEffect(() => {
    if (value === undefined) {
      setDisplayValue(undefined)
      setRolling(false)
      return
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDisplayValue(value)
      setRolling(false)
      return
    }
    setRolling(true)
    let tick = 0
    let interval: number | undefined
    let finishTimer: number | undefined
    const startTimer = window.setTimeout(() => {
      interval = window.setInterval(() => {
        tick += 1
        setDisplayValue(((value + tick * 7) % 20) + 1)
      }, 75)
      finishTimer = window.setTimeout(() => {
        window.clearInterval(interval)
        setDisplayValue(value)
        setRolling(false)
      }, 800)
    }, delay)
    return () => {
      window.clearTimeout(startTimer)
      if (interval !== undefined) window.clearInterval(interval)
      if (finishTimer !== undefined) window.clearTimeout(finishTimer)
    }
  }, [delay, value])

  return { displayValue, rolling }
}

const FantasyDie = ({
  value,
  delay,
}: {
  value: number | undefined
  delay: number
}) => {
  const { displayValue, rolling } = useAnimatedRoll(value, delay)
  return (
    <div
      className={`fantasy-die ${rolling ? "fantasy-die--rolling" : ""}`}
      aria-label={
        value === undefined ? "Nog niet gegooid" : `Dobbelsteenworp ${value}`
      }
    >
      <span aria-hidden="true">{displayValue ?? "D20"}</span>
    </div>
  )
}

const PlayerDicePanel = ({
  playerId,
  index,
  revealOutcome,
}: {
  playerId: PlayerId
  index: number
  revealOutcome: boolean
}) => {
  const runtime = useBattleRuntime()
  const { game, pending } = runtime
  const state = game.firstPlayerRoll
  const player = game.players[playerId]
  if (!player) return null
  const commandId = player.zones.command[0]
  const commander = commandId
    ? game.cardDefinitionsById[game.cardsById[commandId]?.definitionId ?? ""]
    : undefined
  const eligible = state.eligiblePlayerIds.includes(playerId)
  const hasRolled = state.rolls[playerId] !== undefined
  const winner = revealOutcome && state.winnerPlayerId === playerId
  const tied = revealOutcome && state.tiedPlayerIds.includes(playerId)
  const eliminated =
    revealOutcome && state.eliminatedPlayerIds.includes(playerId)
  const controllable = canControlPlayer(runtime, playerId)
  const outcomePending =
    !revealOutcome &&
    (state.status === "tie" || state.status === "winner_determined")
  const status = outcomePending
    ? "Dobbelsteen rolt…"
    : winner
      ? "Mag beginnen"
      : tied
        ? "Opnieuw gooien"
        : eliminated
          ? "Uitgeschakeld"
          : hasRolled
            ? "Worp staat vast"
            : eligible
              ? "Klaar om te gooien"
              : "Wachten"

  return (
    <article
      className={`dice-player ${winner ? "dice-player--winner" : ""} ${
        tied ? "dice-player--tie" : ""
      } ${eliminated ? "dice-player--eliminated" : ""}`}
    >
      <div className="dice-player__identity">
        <span className="dice-player__avatar" aria-hidden="true">
          {initials(player.name)}
        </span>
        <div>
          <h2>{player.name}</h2>
          <p>{commander?.name ?? "Planeswalker"}</p>
        </div>
      </div>
      <FantasyDie value={state.rolls[playerId]} delay={index * 70} />
      <strong className="dice-player__status">{status}</strong>
      {runtime.firstPlayerRollFlow === "individual" &&
      controllable &&
      eligible &&
      !hasRolled &&
      revealOutcome ? (
        <button
          className="button button--primary dice-player__roll"
          type="button"
          disabled={pending}
          onClick={() => {
            runtime.actions.rollForFirstPlayer(playerId)
          }}
        >
          Gooi dobbelsteen
        </button>
      ) : null}
    </article>
  )
}

export const FirstPlayerRollScreen = () => {
  const runtime = useBattleRuntime()
  const state = runtime.game.firstPlayerRoll
  const startButton = useRef<HTMLButtonElement>(null)
  const needsRoll = state.eligiblePlayerIds.some(
    playerId => state.rolls[playerId] === undefined,
  )
  const winnerName = state.winnerPlayerId
    ? runtime.game.players[state.winnerPlayerId]?.name
    : null
  const outcomeAvailable =
    state.status === "tie" || state.status === "winner_determined"
  const [revealedRollSequence, setRevealedRollSequence] = useState<
    number | null
  >(outcomeAvailable ? null : state.rollSequence)
  const revealOutcome =
    !outcomeAvailable || revealedRollSequence === state.rollSequence

  useEffect(() => {
    if (!outcomeAvailable) {
      setRevealedRollSequence(state.rollSequence)
      return
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setRevealedRollSequence(state.rollSequence)
      return
    }
    const timer = window.setTimeout(
      () => {
        setRevealedRollSequence(state.rollSequence)
      },
      900 + Math.max(0, state.participantIds.length - 1) * 70,
    )
    return () => {
      window.clearTimeout(timer)
    }
  }, [outcomeAvailable, state.participantIds.length, state.rollSequence])

  useEffect(() => {
    if (state.status === "winner_determined" && revealOutcome) {
      startButton.current?.focus()
    }
  }, [revealOutcome, state.status])

  return (
    <section
      className="first-player-roll"
      aria-labelledby="first-player-roll-title"
    >
      <div className="first-player-roll__aurora" aria-hidden="true" />
      <header className="first-player-roll__header">
        <span className="eyebrow">Startbepaling · ronde {state.round}</span>
        <h1 id="first-player-roll-title">Wie mag beginnen?</h1>
        <p>De speler met de hoogste unieke D20-worp mag beginnen.</p>
      </header>

      <div
        className="dice-player-grid"
        data-player-count={state.participantIds.length}
      >
        {state.participantIds.map((playerId, index) => (
          <PlayerDicePanel
            key={playerId}
            playerId={playerId}
            index={index}
            revealOutcome={revealOutcome}
          />
        ))}
      </div>

      <div className="first-player-roll__result" aria-live="polite">
        {outcomeAvailable && !revealOutcome ? (
          <>
            <strong>De dobbelstenen rollen…</strong>
            <span>De uitslag verschijnt zodra alle worpen zijn geland.</span>
          </>
        ) : state.status === "tie" ? (
          <>
            <strong>Gelijke hoogste worp!</strong>
            <span>Alleen de spelers met de hoogste waarde gooien opnieuw.</span>
          </>
        ) : state.status === "winner_determined" ? (
          <>
            <strong>{winnerName} mag beginnen</strong>
            <span>De startspeler is vastgesteld voor ronde 1.</span>
          </>
        ) : (
          <>
            <strong>De dobbelstenen wachten</strong>
            <span>
              {runtime.firstPlayerRollFlow === "all"
                ? "Laat alle spelers tegelijk hun worp bepalen."
                : "Iedere speler gooit één keer in de huidige ronde."}
            </span>
          </>
        )}
      </div>

      <div className="first-player-roll__actions">
        {runtime.firstPlayerRollFlow === "all" && needsRoll && revealOutcome ? (
          <button
            className="button button--primary button--large"
            type="button"
            disabled={runtime.pending}
            onClick={runtime.actions.rollAllForFirstPlayer}
          >
            {state.status === "tie"
              ? "Laat tied spelers opnieuw gooien"
              : "Laat iedereen gooien"}
          </button>
        ) : null}
        {state.status === "winner_determined" &&
        revealOutcome &&
        runtime.canCompleteFirstPlayerRoll ? (
          <button
            ref={startButton}
            className="button button--primary button--large"
            type="button"
            disabled={runtime.pending}
            onClick={runtime.actions.completeFirstPlayerRoll}
          >
            Start wedstrijd
          </button>
        ) : state.status === "winner_determined" && revealOutcome ? (
          <p>Wachten tot de host de wedstrijd start…</p>
        ) : null}
      </div>
    </section>
  )
}
