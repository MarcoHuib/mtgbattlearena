import type { SyntheticEvent } from "react"
import { commanderDefinitions, deckCardCount } from "@mtg/game-core/decks"
import type { PlayerId } from "@mtg/game-core/types"
import { useAppDispatch, useAppSelector } from "../../app/hooks"
import { importDeckForPlayer, setDeckUrl } from "./setupSlice"

type DeckSlotProps = {
  playerId: PlayerId
  number: number
}

export const DeckSlot = ({ playerId, number }: DeckSlotProps) => {
  const dispatch = useAppDispatch()
  const slot = useAppSelector(state => state.setup[playerId])
  const commanders = slot.deck ? commanderDefinitions(slot.deck) : []

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    void dispatch(importDeckForPlayer({ playerId, url: slot.url }))
  }

  return (
    <section className={`deck-slot deck-slot--${number}`}>
      <div className="deck-slot__heading">
        <span>Speler {number}</span>
        <span className={`import-state import-state--${slot.status}`}>
          {slot.status === "loading"
            ? "Importeren…"
            : slot.status === "ready"
              ? "Gereed"
              : slot.status === "error"
                ? "Actie nodig"
                : "Nog leeg"}
        </span>
      </div>
      <form onSubmit={submit}>
        <label htmlFor={`deck-url-${number}`}>Openbare Archidekt-URL</label>
        <div className="deck-input-row">
          <input
            id={`deck-url-${number}`}
            name={`deck-url-${number}`}
            type="url"
            inputMode="url"
            placeholder="https://archidekt.com/decks/12345/mijn-deck"
            value={slot.url}
            onChange={event => {
              dispatch(setDeckUrl({ playerId, url: event.target.value }))
            }}
            aria-describedby={`deck-message-${number}`}
            required
          />
          <button
            className="button button--secondary"
            type="submit"
            disabled={slot.status === "loading" || !slot.url.trim()}
          >
            {slot.deck ? "Opnieuw importeren" : "Deck importeren"}
          </button>
        </div>
      </form>
      <div
        id={`deck-message-${number}`}
        className="deck-slot__message"
        aria-live="polite"
      >
        {slot.error ? (
          <p className="error-message">{slot.error}</p>
        ) : slot.deck ? (
          <div className="deck-preview">
            <div>
              <span className="eyebrow">Deckpreview</span>
              <h3>{slot.deck.name}</h3>
            </div>
            <dl>
              <div>
                <dt>Commander</dt>
                <dd>
                  {commanders.map(card => card.name).join(" · ") ||
                    "Niet gemarkeerd"}
                </dd>
              </div>
              <div>
                <dt>Kaarten</dt>
                <dd>{deckCardCount(slot.deck)}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p>
            Het deck wordt als onveranderlijke lokale snapshot bewaard na
            import.
          </p>
        )}
      </div>
    </section>
  )
}
