import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react"
import type { CloudDeckMetadata } from "@mtg/game-core/types"
import { AppLink } from "../../app/router"
import { AppShell } from "../../components/AppShell"
import {
  useCreateCloudDeckMutation,
  useDeleteCloudDeckMutation,
  useUpdateCloudDeckMutation,
} from "../../app/api/remoteGraphqlApi"
import { createFirestoreCloudDeckRepository } from "../decks/cloudDeckRepository"
import { readFirebaseConfig } from "../online/firebaseAuth"
import type { AuthService } from "../online/types"

type DecksScreenProps = { auth: AuthService }
type WizardStep = "closed" | "provider" | "reference" | "importing" | "success"

const firebaseConfig = readFirebaseConfig(import.meta.env)

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))

export const DecksScreen = ({ auth }: DecksScreenProps) => {
  const authState = useSyncExternalStore(
    auth.subscribe.bind(auth),
    auth.getState.bind(auth),
    auth.getState.bind(auth),
  )
  const repository = useMemo(
    () =>
      firebaseConfig.configured
        ? createFirestoreCloudDeckRepository(firebaseConfig.options)
        : null,
    [],
  )
  const [decks, setDecks] = useState<CloudDeckMetadata[]>([])
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [message, setMessage] = useState<string | null>(null)
  const [wizard, setWizard] = useState<WizardStep>("closed")
  const [url, setUrl] = useState("")
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [createDeck] = useCreateCloudDeckMutation()
  const [updateDeck] = useUpdateCloudDeckMutation()
  const [deleteDeck] = useDeleteCloudDeckMutation()

  const load = useCallback(async () => {
    if (authState.status !== "signed-in" || !repository) {
      setDecks([])
      setStatus("ready")
      return
    }
    setStatus("loading")
    try {
      setDecks(await repository.list(authState.user.uid))
      setStatus("ready")
    } catch {
      setStatus("error")
    }
  }, [authState, repository])

  useEffect(() => void load(), [load])

  const submitImport = async () => {
    setWizard("importing")
    setMessage(null)
    try {
      const result = await createDeck({ url: url.trim() }).unwrap()
      setDecks(current => [
        result.createCloudDeck as CloudDeckMetadata,
        ...current,
      ])
      setWizard("success")
      setMessage(
        `${result.createCloudDeck.name} is aan je Deck Library toegevoegd.`,
      )
    } catch (error) {
      const duplicate = JSON.stringify(error).includes("DECK_ALREADY_IMPORTED")
      setWizard("reference")
      setMessage(
        duplicate
          ? "Dit deck staat al in je bibliotheek. Gebruik Update."
          : "Het deck kon niet veilig worden geïmporteerd.",
      )
    }
  }

  const update = async (deck: CloudDeckMetadata) => {
    setMessage(`${deck.name} bijwerken…`)
    try {
      const result = await updateDeck({ deckKey: deck.deckKey }).unwrap()
      const next = result.updateCloudDeck as CloudDeckMetadata
      setDecks(current =>
        current.map(candidate =>
          candidate.deckKey === next.deckKey ? next : candidate,
        ),
      )
      setMessage(`${next.name} is bijgewerkt.`)
    } catch {
      setMessage(
        `Bijwerken van ${deck.name} mislukte. De vorige versie is behouden.`,
      )
    }
  }

  const remove = async (deck: CloudDeckMetadata) => {
    try {
      await deleteDeck({ deckKey: deck.deckKey }).unwrap()
      setDecks(current =>
        current.filter(candidate => candidate.deckKey !== deck.deckKey),
      )
      setMessage(
        `${deck.name} is verwijderd. Bestaande battles blijven behouden.`,
      )
    } catch {
      setMessage(`${deck.name} kon niet worden verwijderd.`)
    } finally {
      setConfirmDelete(null)
    }
  }

  return (
    <AppShell activeRoute="/decks">
      <section className="content-page deck-library-page">
        <header className="deck-library-hero">
          <div>
            <span className="eyebrow">Jouw cloudcollectie</span>
            <h1>Deck Library</h1>
            <p>
              Beheer je opgeslagen decks hier. Updates gebeuren alleen wanneer
              jij daarvoor kiest.
            </p>
          </div>
          {authState.status === "signed-in" ? (
            <button
              className="button button--primary"
              type="button"
              onClick={() => {
                setWizard("provider")
              }}
            >
              + Deck toevoegen
            </button>
          ) : null}
        </header>

        {message ? (
          <p className="inline-message" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
        {authState.status !== "signed-in" ? (
          <div className="content-card deck-library-empty">
            <h2>Log in voor je Deck Library</h2>
            <p>
              Offline battles en lokale imports blijven zonder account
              beschikbaar.
            </p>
            <AppLink className="button button--primary" to="/online">
              Naar inloggen
            </AppLink>
          </div>
        ) : status === "loading" ? (
          <div
            className="deck-library-grid"
            aria-busy="true"
            aria-label="Decks laden"
          >
            <article className="deck-tile deck-tile--skeleton" />
            <article className="deck-tile deck-tile--skeleton" />
          </div>
        ) : status === "error" ? (
          <div className="content-card" role="alert">
            <h2>Je collectie kon niet worden geladen</h2>
            <p>Controleer je verbinding en probeer opnieuw.</p>
            <button
              className="button button--secondary"
              onClick={() => void load()}
            >
              Opnieuw proberen
            </button>
          </div>
        ) : decks.length === 0 ? (
          <div className="content-card deck-library-empty">
            <h2>Je collectie wacht op het eerste deck</h2>
            <p>
              Voeg een openbaar Archidekt-deck toe. Moxfield en ManaBox volgen
              in latere features.
            </p>
            <button
              className="button button--primary"
              onClick={() => {
                setWizard("provider")
              }}
            >
              + Deck toevoegen
            </button>
          </div>
        ) : (
          <div className="deck-library-grid">
            {decks.map(deck => (
              <article className="deck-tile" key={deck.deckKey}>
                <div className="deck-tile__top">
                  <span className="mode-badge">Archidekt</span>
                  <span>{deck.format ?? "Deck"}</span>
                </div>
                <h2>{deck.name}</h2>
                <p>{deck.commanderSummary ?? "Geen commander opgegeven"}</p>
                <dl>
                  <div>
                    <dt>Kaarten</dt>
                    <dd>{deck.cardCount}</dd>
                  </div>
                  <div>
                    <dt>Bijgewerkt</dt>
                    <dd>{dateLabel(deck.updatedAt)}</dd>
                  </div>
                </dl>
                <div className="deck-tile__actions">
                  <button
                    className="button button--secondary"
                    onClick={() => void update(deck)}
                  >
                    Update
                  </button>
                  {confirmDelete === deck.deckKey ? (
                    <>
                      <button
                        className="button button--secondary"
                        onClick={() => {
                          setConfirmDelete(null)
                        }}
                      >
                        Annuleren
                      </button>
                      <button
                        className="button button--danger"
                        onClick={() => void remove(deck)}
                      >
                        Bevestig verwijderen
                      </button>
                    </>
                  ) : (
                    <button
                      className="button button--secondary"
                      onClick={() => {
                        setConfirmDelete(deck.deckKey)
                      }}
                    >
                      Verwijderen
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {wizard !== "closed" ? (
          <div className="modal-backdrop" role="presentation">
            <section
              className="confirm-dialog deck-wizard"
              role="dialog"
              aria-modal="true"
              aria-labelledby="deck-wizard-title"
            >
              <span className="eyebrow">
                Deck toevoegen ·{" "}
                {wizard === "provider"
                  ? "1 van 4"
                  : wizard === "reference"
                    ? "2 van 4"
                    : wizard === "importing"
                      ? "3 van 4"
                      : "4 van 4"}
              </span>
              <h2 id="deck-wizard-title">
                {wizard === "provider"
                  ? "Kies een provider"
                  : wizard === "reference"
                    ? "Plak je deckreferentie"
                    : wizard === "importing"
                      ? "Deck importeren…"
                      : "Deck toegevoegd"}
              </h2>
              {wizard === "provider" ? (
                <div className="deck-provider-list">
                  <button
                    className="deck-provider is-selected"
                    onClick={() => {
                      setWizard("reference")
                    }}
                  >
                    <strong>Archidekt</strong>
                    <span>Beschikbaar</span>
                  </button>
                  <button className="deck-provider" disabled>
                    <strong>Moxfield</strong>
                    <span>Gepland</span>
                  </button>
                  <button className="deck-provider" disabled>
                    <strong>ManaBox</strong>
                    <span>Gepland</span>
                  </button>
                </div>
              ) : null}
              {wizard === "reference" ? (
                <label>
                  Openbare Archidekt-URL
                  <input
                    type="url"
                    autoFocus
                    value={url}
                    placeholder="https://archidekt.com/decks/…"
                    onChange={event => {
                      setUrl(event.target.value)
                    }}
                  />
                </label>
              ) : null}
              {wizard === "importing" ? (
                <p aria-live="polite">
                  De providerdata wordt gevalideerd en genormaliseerd. Sluit dit
                  venster niet.
                </p>
              ) : null}
              {wizard === "success" ? (
                <p>
                  Het deck staat nu klaar in je collectie en kan in een online
                  lobby worden gekozen.
                </p>
              ) : null}
              <div>
                {wizard === "reference" ? (
                  <button
                    className="button button--primary"
                    disabled={!url.trim()}
                    onClick={() => void submitImport()}
                  >
                    Import starten
                  </button>
                ) : null}
                {wizard === "success" ? (
                  <button
                    className="button button--primary"
                    onClick={() => {
                      setWizard("closed")
                      setUrl("")
                    }}
                  >
                    Naar collectie
                  </button>
                ) : null}
                {wizard !== "importing" && wizard !== "success" ? (
                  <button
                    className="button button--secondary"
                    onClick={() => {
                      setWizard("closed")
                    }}
                  >
                    Annuleren
                  </button>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </AppShell>
  )
}
