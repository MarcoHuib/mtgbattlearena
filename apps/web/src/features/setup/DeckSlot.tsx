import { useState } from "react"
import type { SyntheticEvent } from "react"
import { commanderDefinitions, deckCardCount } from "@mtg/game-core/decks"
import { getCardImageUrl } from "@mtg/game-core/images"
import type { PlayerId } from "@mtg/game-core/types"
import { useAppDispatch, useAppSelector } from "../../app/hooks"
import {
  importDeckForPlayer,
  removePlayer,
  setDeckUrl,
  setPlayerName,
} from "./setupSlice"
import type { OfflineDeckChoice } from "./SetupScreen"

const manaLabels: Record<string, string> = {
  W: "Wit",
  U: "Blauw",
  B: "Zwart",
  R: "Rood",
  G: "Groen",
  C: "Kleurloos",
}

type DeckSlotProps = {
  playerId: PlayerId
  number: number
  canRemove: boolean
  deckChoices: OfflineDeckChoice[]
  libraryStatus: "loading" | "ready" | "error"
  onChooseDeck: (deck: OfflineDeckChoice) => void
}

export const DeckSlot = ({
  playerId,
  number,
  canRemove,
  deckChoices,
  libraryStatus,
  onChooseDeck,
}: DeckSlotProps) => {
  const dispatch = useAppDispatch()
  const [wizardStep, setWizardStep] = useState<
    "closed" | "provider" | "reference"
  >("closed")
  const [providerSelected, setProviderSelected] = useState(false)
  const slot = useAppSelector(state => state.setup.players[playerId])
  if (!slot) return null
  const commanders = slot.deck ? commanderDefinitions(slot.deck) : []
  const selectedDeckKey = slot.deck?.deckSourceId ?? slot.deck?.id

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = await dispatch(
      importDeckForPlayer({ playerId, url: slot.url }),
    )
    if (importDeckForPlayer.fulfilled.match(result)) {
      setWizardStep("closed")
      setProviderSelected(false)
    }
  }

  return (
    <section className="deck-slot" data-player-id={playerId}>
      <div className="deck-slot__heading">
        <span>Speler {number}</span>
        {canRemove ? (
          <button
            className="button button--ghost deck-slot__remove"
            type="button"
            onClick={() => dispatch(removePlayer(playerId))}
            aria-label={`Speler ${number} verwijderen`}
          >
            Verwijderen
          </button>
        ) : null}
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
      <label htmlFor={`player-name-${number}`}>Spelersnaam</label>
      <input
        id={`player-name-${number}`}
        className="deck-slot__name"
        value={slot.name}
        placeholder={`Speler ${number}`}
        maxLength={60}
        onChange={event =>
          dispatch(setPlayerName({ playerId, name: event.target.value }))
        }
      />
      <div className="offline-deck-picker">
        <div className="offline-deck-picker__heading">
          <div>
            <span className="eyebrow">Jouw Deck Library</span>
            <h3>Kies een opgeslagen deck</h3>
          </div>
          <span>Wordt lokaal klaargezet</span>
        </div>
        {libraryStatus === "loading" ? (
          <p className="offline-deck-picker__state">Decks laden…</p>
        ) : libraryStatus === "error" ? (
          <p className="error-message">
            De Deck Library kon niet worden geladen. Je kunt hieronder nog
            steeds rechtstreeks importeren.
          </p>
        ) : deckChoices.length ? (
          <div
            className="lobby-deck-options offline-deck-options"
            role="radiogroup"
            aria-label={`Deck voor speler ${number}`}
          >
            {deckChoices.map(deck => {
              const selected = selectedDeckKey === deck.deckKey
              const imageUrl = deck.thumbnailImageRef
                ? getCardImageUrl(deck.thumbnailImageRef)
                : null
              return (
                <button
                  key={deck.deckKey}
                  className={`lobby-deck-option${selected ? " is-selected" : ""}`}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={slot.status === "loading"}
                  onClick={() => {
                    onChooseDeck(deck)
                  }}
                >
                  <span className="lobby-deck-option__art" aria-hidden="true">
                    {imageUrl ? (
                      <img src={imageUrl} alt="" loading="lazy" />
                    ) : (
                      deck.name.slice(0, 1)
                    )}
                  </span>
                  <span className="lobby-deck-option__content">
                    <strong>{deck.name}</strong>
                    <small>
                      {deck.commanderSummary ??
                        deck.format ??
                        "Opgeslagen deck"}
                    </small>
                    <span className="lobby-deck-option__meta">
                      <span>{deck.cardCount} kaarten</span>
                      <span
                        className="lobby-deck-colors"
                        aria-label={`Kleuridentiteit: ${(deck.colorIdentity?.length ? deck.colorIdentity : ["C"]).map(color => manaLabels[color] ?? color).join(", ")}`}
                      >
                        {(deck.colorIdentity?.length
                          ? deck.colorIdentity
                          : ["C"]
                        ).map(color => (
                          <i
                            key={color}
                            className={`deck-color deck-color--${color.toLowerCase()}`}
                            aria-hidden="true"
                          >
                            {color}
                          </i>
                        ))}
                      </span>
                    </span>
                  </span>
                  <span className="lobby-deck-option__check" aria-hidden="true">
                    ✓
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="offline-deck-picker__state">
            Nog geen opgeslagen decks. Importeer hieronder een openbaar deck of
            voeg er een toe in de Deck Library.
          </p>
        )}
      </div>
      <button
        className="button button--secondary offline-import-trigger"
        type="button"
        onClick={() => {
          setWizardStep("provider")
        }}
      >
        {slot.deck ? "Ander deck importeren" : "Deck via provider importeren"}
      </button>
      {wizardStep !== "closed" ? (
        <div
          className="modal-backdrop deck-wizard-backdrop"
          role="presentation"
        >
          <section
            className="deck-wizard"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`offline-wizard-title-${number}`}
          >
            <header className="deck-wizard__header">
              <div>
                <span className="eyebrow">Lokale deckimport</span>
                <h2 id={`offline-wizard-title-${number}`}>
                  {wizardStep === "provider"
                    ? "Kies je deckprovider"
                    : "Voeg je deck toe"}
                </h2>
              </div>
              <button
                className="deck-wizard__close"
                type="button"
                aria-label="Importwizard sluiten"
                onClick={() => {
                  setWizardStep("closed")
                }}
              >
                ×
              </button>
            </header>
            <div className="deck-wizard__body">
              {wizardStep === "provider" ? (
                <div
                  className="deck-provider-list"
                  role="radiogroup"
                  aria-label="Deckprovider"
                >
                  <button
                    className={`deck-provider${providerSelected ? " is-selected" : ""}`}
                    type="button"
                    role="radio"
                    aria-checked={providerSelected}
                    onClick={() => {
                      setProviderSelected(true)
                    }}
                  >
                    <span className="deck-provider__mark" aria-hidden="true">
                      A
                    </span>
                    <span className="deck-provider__copy">
                      <strong>Archidekt</strong>
                      <small>Importeer een openbaar deck via URL.</small>
                    </span>
                    <span className="deck-provider__status is-available">
                      Beschikbaar
                    </span>
                  </button>
                  <button className="deck-provider" type="button" disabled>
                    <span className="deck-provider__mark" aria-hidden="true">
                      M
                    </span>
                    <span className="deck-provider__copy">
                      <strong>Moxfield</strong>
                      <small>Voorbereid als volgende providerslice.</small>
                    </span>
                    <span className="deck-provider__status">Binnenkort</span>
                  </button>
                  <button className="deck-provider" type="button" disabled>
                    <span className="deck-provider__mark" aria-hidden="true">
                      M
                    </span>
                    <span className="deck-provider__copy">
                      <strong>ManaBox</strong>
                      <small>Beschikbaar na de private adapterkoppeling.</small>
                    </span>
                    <span className="deck-provider__status">Binnenkort</span>
                  </button>
                </div>
              ) : (
                <form
                  id={`offline-import-form-${number}`}
                  onSubmit={event => void submit(event)}
                >
                  <label htmlFor={`deck-url-${number}`}>
                    Openbare Archidekt-URL
                  </label>
                  <div className="deck-input-row">
                    <input
                      id={`deck-url-${number}`}
                      name={`deck-url-${number}`}
                      type="url"
                      inputMode="url"
                      placeholder="https://archidekt.com/decks/12345/mijn-deck"
                      value={slot.url}
                      onChange={event =>
                        dispatch(
                          setDeckUrl({ playerId, url: event.target.value }),
                        )
                      }
                      aria-describedby={`deck-message-${number}`}
                      required
                    />
                  </div>
                  <p>
                    Dit deck wordt alleen lokaal opgeslagen en niet naar
                    Firebase geschreven.
                  </p>
                </form>
              )}
            </div>
            <footer className="deck-wizard__footer">
              {wizardStep === "provider" ? (
                <button
                  className="button button--primary"
                  type="button"
                  disabled={!providerSelected}
                  onClick={() => {
                    setWizardStep("reference")
                  }}
                >
                  Doorgaan
                </button>
              ) : (
                <>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => {
                      setWizardStep("provider")
                    }}
                  >
                    Terug
                  </button>
                  <button
                    className="button button--primary"
                    type="submit"
                    form={`offline-import-form-${number}`}
                    disabled={slot.status === "loading" || !slot.url.trim()}
                  >
                    {slot.status === "loading"
                      ? "Importeren…"
                      : "Lokaal importeren"}
                  </button>
                </>
              )}
            </footer>
          </section>
        </div>
      ) : null}
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
