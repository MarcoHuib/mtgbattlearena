import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import {
  createFirestoreCloudDeckRepository,
  type CloudDeckRepository,
} from "../decks/cloudDeckRepository"
import { readFirebaseConfig } from "../online/firebaseAuth"
import type { AuthService } from "../online/types"

type DecksScreenProps = {
  auth: AuthService
  repository?: CloudDeckRepository | null
}
type WizardStep = "closed" | "provider" | "reference" | "importing" | "success"
type ImportState = "idle" | "loading" | "error"

const firebaseConfig = readFirebaseConfig(import.meta.env)
const steps = ["Provider", "Deck", "Import", "Klaar"] as const

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(
    new Date(value),
  )

export const validateArchidektUrl = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return "Plak eerst een Archidekt deck-URL."
  try {
    const parsed = new URL(trimmed)
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "")
    if (parsed.protocol !== "https:" || host !== "archidekt.com")
      return "Gebruik een openbare URL van archidekt.com."
    if (!/^\/decks\/\d+(?:\/[^/?#]+)?\/?$/.test(parsed.pathname))
      return "Deze URL bevat geen bruikbare Archidekt deck-ID."
    return null
  } catch {
    return "Vul een geldige Archidekt deck-URL in."
  }
}

const errorCode = (error: unknown) => {
  if (!error || typeof error !== "object" || !("data" in error)) return null
  const data = error.data
  if (!data || typeof data !== "object" || !("code" in data)) return null
  return typeof data.code === "string" ? data.code : null
}

const importErrorMessage = (error: unknown) => {
  switch (errorCode(error)) {
    case "DECK_ALREADY_IMPORTED":
      return "Dit deck staat al in je Deck Library. Gebruik Update om de nieuwste versie op te halen."
    case "DECK_NOT_FOUND":
      return "Archidekt kon dit deck niet vinden. Controleer of het deck openbaar is."
    case "INVALID_DECK_URL":
      return "Deze Archidekt-URL kan niet worden gebruikt."
    case "DECK_PROVIDER_UNAVAILABLE":
      return "Archidekt is tijdelijk niet bereikbaar. Probeer het later opnieuw."
    case "NETWORK_ERROR":
    case "NOT_CONFIGURED":
      return import.meta.env.DEV
        ? "De lokale Game Worker is niet bereikbaar. Start de volledige stack met npm run dev."
        : "De importservice is momenteel niet bereikbaar. Probeer het later opnieuw."
    default:
      return "Archidekt kon het deck niet ophalen. Je kunt het opnieuw proberen."
  }
}

const ProviderMark = ({ label }: { label: string }) => (
  <span className="deck-provider__mark" aria-hidden="true">
    {label.slice(0, 1)}
  </span>
)

const ActionIcon = ({
  type,
}: {
  type: "play" | "update" | "delete" | "close"
}) => {
  const paths = {
    play: "M8 5v14l11-7z",
    update:
      "M20 6v5h-5M4 18v-5h5M6.1 9a7 7 0 0 1 11.4-2.4L20 9M4 15l2.5 2.4A7 7 0 0 0 17.9 15",
    delete: "M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5",
    close: "M6 6l12 12M18 6 6 18",
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[type]} />
    </svg>
  )
}

export const DecksScreen = ({
  auth,
  repository: injectedRepository,
}: DecksScreenProps) => {
  const authState = useSyncExternalStore(
    auth.subscribe.bind(auth),
    auth.getState.bind(auth),
    auth.getState.bind(auth),
  )
  const configuredRepository = useMemo(
    () =>
      firebaseConfig.configured
        ? createFirestoreCloudDeckRepository(
            firebaseConfig.options,
            import.meta.env.DEV
              ? import.meta.env.VITE_FIRESTORE_EMULATOR_HOST
              : undefined,
          )
        : null,
    [],
  )
  const repository =
    injectedRepository === undefined ? configuredRepository : injectedRepository
  const [decks, setDecks] = useState<CloudDeckMetadata[]>([])
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [notice, setNotice] = useState<string | null>(null)
  const [wizard, setWizard] = useState<WizardStep>("closed")
  const [providerSelected, setProviderSelected] = useState(false)
  const [url, setUrl] = useState("")
  const [urlTouched, setUrlTouched] = useState(false)
  const [importState, setImportState] = useState<ImportState>("idle")
  const [importError, setImportError] = useState<string | null>(null)
  const [importedDeck, setImportedDeck] = useState<CloudDeckMetadata | null>(
    null,
  )
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const importPending = useRef(false)
  const [createDeck] = useCreateCloudDeckMutation()
  const [updateDeck] = useUpdateCloudDeckMutation()
  const [deleteDeck] = useDeleteCloudDeckMutation()
  const validationError = validateArchidektUrl(url)

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

  const closeWizard = useCallback(() => {
    if (importState === "loading") return
    setWizard("closed")
    setProviderSelected(false)
    setUrl("")
    setUrlTouched(false)
    setImportState("idle")
    setImportError(null)
    setImportedDeck(null)
  }, [importState])

  useEffect(() => {
    if (wizard === "closed") return
    const previous = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
    focusable()[0]?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        closeWizard()
        return
      }
      if (event.key !== "Tab") return
      const items = focusable()
      if (!items.length) return
      const first = items[0]
      const last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      previous?.focus()
    }
  }, [closeWizard, wizard])

  const submitImport = async () => {
    setUrlTouched(true)
    if (validationError || importPending.current) return
    importPending.current = true
    setWizard("importing")
    setImportState("loading")
    setImportError(null)
    try {
      const result = await createDeck({ url: url.trim() }).unwrap()
      const created = result.createCloudDeck as CloudDeckMetadata
      setDecks(current => [
        created,
        ...current.filter(deck => deck.deckKey !== created.deckKey),
      ])
      setImportedDeck(created)
      setImportState("idle")
      setWizard("success")
    } catch (error) {
      setImportState("error")
      setImportError(importErrorMessage(error))
    } finally {
      importPending.current = false
    }
  }

  const update = async (deck: CloudDeckMetadata) => {
    if (updating) return
    setUpdating(deck.deckKey)
    setNotice(null)
    try {
      const result = await updateDeck({ deckKey: deck.deckKey }).unwrap()
      const next = result.updateCloudDeck as CloudDeckMetadata
      setDecks(current =>
        current.map(candidate =>
          candidate.deckKey === next.deckKey ? next : candidate,
        ),
      )
      setNotice(`${next.name} is bijgewerkt.`)
    } catch {
      setNotice(
        `Bijwerken van ${deck.name} mislukte. De vorige versie is behouden.`,
      )
    } finally {
      setUpdating(null)
    }
  }

  const remove = async (deck: CloudDeckMetadata) => {
    if (deleting) return
    setDeleting(deck.deckKey)
    try {
      await deleteDeck({ deckKey: deck.deckKey }).unwrap()
      setDecks(current =>
        current.filter(candidate => candidate.deckKey !== deck.deckKey),
      )
      setNotice(
        `${deck.name} is verwijderd. Bestaande battles blijven behouden.`,
      )
    } catch {
      setNotice(`${deck.name} kon niet worden verwijderd.`)
    } finally {
      setDeleting(null)
      setConfirmDelete(null)
    }
  }

  const stepIndex =
    wizard === "provider"
      ? 0
      : wizard === "reference"
        ? 1
        : wizard === "importing"
          ? 2
          : 3

  return (
    <AppShell activeRoute="/decks">
      <section className="content-page deck-library-page">
        <header className="deck-library-header">
          <div>
            <span className="eyebrow">Jouw collectie</span>
            <h1>Deck Library</h1>
            <p>Beheer de decks waarmee je offline en online speelt.</p>
          </div>
          {authState.status === "signed-in" ? (
            <button
              className="button button--primary deck-library-add"
              type="button"
              onClick={() => {
                setWizard("provider")
              }}
            >
              <span aria-hidden="true">＋</span> Deck toevoegen
            </button>
          ) : null}
        </header>

        {notice ? (
          <p
            className="inline-message deck-library-notice"
            role="status"
            aria-live="polite"
          >
            {notice}
          </p>
        ) : null}
        {authState.status !== "signed-in" ? (
          <div className="content-card deck-library-empty">
            <div className="deck-library-empty__art" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div>
              <h2>Log in voor je Deck Library</h2>
              <p>
                Je cloudcollectie hoort bij je account. Offline battles blijven
                zonder account beschikbaar.
              </p>
            </div>
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
            {[0, 1, 2].map(item => (
              <article className="deck-tile deck-tile--skeleton" key={item}>
                <span />
                <span />
                <span />
              </article>
            ))}
          </div>
        ) : status === "error" ? (
          <div className="content-card deck-library-state" role="alert">
            <span className="deck-library-state__icon" aria-hidden="true">
              !
            </span>
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
            <div className="deck-library-empty__art" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div>
              <h2>Je hebt nog geen decks</h2>
              <p>
                Voeg een openbaar Archidekt-deck toe om je collectie te
                beginnen.
              </p>
            </div>
            <button
              className="button button--primary"
              onClick={() => {
                setWizard("provider")
              }}
            >
              Deck toevoegen
            </button>
          </div>
        ) : (
          <div className="deck-library-grid" aria-label="Opgeslagen decks">
            {decks.map(deck => (
              <article
                className="deck-tile"
                key={deck.deckKey}
                id={`deck-${deck.deckKey}`}
                tabIndex={-1}
              >
                <div className="deck-tile__glow" aria-hidden="true" />
                <div className="deck-tile__top">
                  <span className="deck-provider-badge">Archidekt</span>
                  <span className="deck-format">{deck.format ?? "Deck"}</span>
                </div>
                <div className="deck-tile__identity">
                  <span className="deck-tile__monogram" aria-hidden="true">
                    {deck.name.slice(0, 1)}
                  </span>
                  <div>
                    <h2>{deck.name}</h2>
                    <p>{deck.commanderSummary ?? "Geen commander opgegeven"}</p>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>Kaarten</dt>
                    <dd>{deck.cardCount}</dd>
                  </div>
                  <div>
                    <dt>Laatste update</dt>
                    <dd>{dateLabel(deck.updatedAt)}</dd>
                  </div>
                </dl>
                <div className="deck-tile__actions">
                  <AppLink
                    className="deck-action deck-action--primary"
                    to="/online"
                  >
                    <ActionIcon type="play" />
                    Spelen
                  </AppLink>
                  <button
                    className="deck-action"
                    type="button"
                    disabled={updating === deck.deckKey}
                    aria-label={`${deck.name} bijwerken`}
                    onClick={() => void update(deck)}
                    title={`${deck.name} bijwerken`}
                  >
                    <ActionIcon type="update" />
                    {updating === deck.deckKey ? "Bezig…" : "Update"}
                  </button>
                  <button
                    className="deck-icon-button"
                    type="button"
                    onClick={() => {
                      setConfirmDelete(deck.deckKey)
                    }}
                    title={`${deck.name} verwijderen`}
                    aria-label={`${deck.name} verwijderen`}
                  >
                    <ActionIcon type="delete" />
                  </button>
                </div>
                {confirmDelete === deck.deckKey ? (
                  <div
                    className="deck-delete-confirm"
                    role="alertdialog"
                    aria-label={`${deck.name} verwijderen`}
                  >
                    <p>
                      <strong>Deck verwijderen?</strong>
                      <span>Bestaande battles blijven behouden.</span>
                    </p>
                    <div>
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
                        disabled={deleting === deck.deckKey}
                        onClick={() => void remove(deck)}
                      >
                        {deleting === deck.deckKey
                          ? "Verwijderen…"
                          : "Verwijderen"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}

        {wizard !== "closed" ? (
          <div
            className="modal-backdrop deck-wizard-backdrop"
            role="presentation"
            onMouseDown={event => {
              if (event.target === event.currentTarget) closeWizard()
            }}
          >
            <section
              ref={dialogRef}
              className="deck-wizard"
              role="dialog"
              aria-modal="true"
              aria-labelledby="deck-wizard-title"
            >
              <header className="deck-wizard__header">
                <div>
                  <span className="eyebrow">Deck toevoegen</span>
                  <h2 id="deck-wizard-title">
                    {wizard === "provider"
                      ? "Kies je deckprovider"
                      : wizard === "reference"
                        ? "Welk deck wil je toevoegen?"
                        : wizard === "importing"
                          ? "Je deck wordt klaargemaakt"
                          : "Klaar voor de arena"}
                  </h2>
                </div>
                <button
                  className="deck-wizard__close"
                  type="button"
                  aria-label="Wizard sluiten"
                  disabled={importState === "loading"}
                  onClick={closeWizard}
                >
                  <ActionIcon type="close" />
                </button>
              </header>
              <ol
                className="deck-stepper"
                aria-label={`Stap ${stepIndex + 1} van 4`}
              >
                {steps.map((step, index) => (
                  <li
                    key={step}
                    className={
                      index < stepIndex
                        ? "is-complete"
                        : index === stepIndex
                          ? "is-current"
                          : ""
                    }
                    aria-current={index === stepIndex ? "step" : undefined}
                  >
                    <span>{index < stepIndex ? "✓" : index + 1}</span>
                    <small>{step}</small>
                  </li>
                ))}
              </ol>
              <div className="deck-wizard__body">
                {wizard === "provider" ? (
                  <div
                    className="deck-provider-list"
                    role="radiogroup"
                    aria-label="Deckprovider"
                  >
                    <button
                      className={`deck-provider ${providerSelected ? "is-selected" : ""}`}
                      role="radio"
                      aria-checked={providerSelected}
                      onClick={() => {
                        setProviderSelected(true)
                      }}
                    >
                      <ProviderMark label="Archidekt" />
                      <span className="deck-provider__copy">
                        <strong>Archidekt</strong>
                        <small>
                          Importeer een openbaar deck via de vertrouwde
                          deck-URL.
                        </small>
                      </span>
                      <span className="deck-provider__status is-available">
                        Beschikbaar
                      </span>
                      {providerSelected ? (
                        <span
                          className="deck-provider__check"
                          aria-hidden="true"
                        >
                          ✓
                        </span>
                      ) : null}
                    </button>
                    <button
                      className="deck-provider"
                      role="radio"
                      aria-checked="false"
                      disabled
                    >
                      <ProviderMark label="Moxfield" />
                      <span className="deck-provider__copy">
                        <strong>Moxfield</strong>
                        <small>
                          Een geliefde deckbuilder die later aan de collectie
                          wordt toegevoegd.
                        </small>
                      </span>
                      <span className="deck-provider__status">Binnenkort</span>
                    </button>
                    <button
                      className="deck-provider"
                      role="radio"
                      aria-checked="false"
                      disabled
                    >
                      <ProviderMark label="ManaBox" />
                      <span className="deck-provider__copy">
                        <strong>ManaBox</strong>
                        <small>
                          Mobiele deckcollecties volgen in een toekomstige
                          uitbreiding.
                        </small>
                      </span>
                      <span className="deck-provider__status">Binnenkort</span>
                    </button>
                  </div>
                ) : null}
                {wizard === "reference" ? (
                  <div className="deck-reference-form">
                    <label htmlFor="archidekt-deck-url">
                      Archidekt deck-URL
                    </label>
                    <p id="archidekt-url-help">
                      Plak de openbare URL van het deck dat je wilt toevoegen.
                    </p>
                    <div
                      className={`deck-url-field ${urlTouched && validationError ? "has-error" : url && !validationError ? "has-success" : ""}`}
                    >
                      <ProviderMark label="Archidekt" />
                      <input
                        id="archidekt-deck-url"
                        type="url"
                        value={url}
                        placeholder="https://archidekt.com/decks/..."
                        aria-describedby={`archidekt-url-help${urlTouched && validationError ? " archidekt-url-error" : ""}`}
                        aria-invalid={urlTouched && Boolean(validationError)}
                        onBlur={() => {
                          setUrlTouched(true)
                        }}
                        onChange={event => {
                          setUrl(event.target.value)
                          setUrlTouched(true)
                        }}
                      />
                      {url && !validationError ? (
                        <span
                          className="deck-url-field__valid"
                          aria-label="Geldige URL"
                        >
                          ✓
                        </span>
                      ) : null}
                    </div>
                    {urlTouched && validationError ? (
                      <p
                        className="deck-field-error"
                        id="archidekt-url-error"
                        role="alert"
                      >
                        {validationError}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {wizard === "importing" ? (
                  <div
                    className={`deck-import-status ${importState === "error" ? "has-error" : ""}`}
                    aria-live="polite"
                  >
                    <div
                      className="deck-import-status__visual"
                      aria-hidden="true"
                    >
                      {importState === "loading" ? (
                        <span className="deck-import-spinner" />
                      ) : (
                        <span className="deck-import-error">!</span>
                      )}
                    </div>
                    <div>
                      <h3>
                        {importState === "loading"
                          ? "Archidekt importeren"
                          : "Import niet voltooid"}
                      </h3>
                      <p>
                        {importState === "loading"
                          ? "De server haalt het deck op, valideert de kaarten en slaat de collectie atomair op."
                          : importError}
                      </p>
                    </div>
                    <ol className="deck-import-phases">
                      <li className="is-complete">
                        <span>✓</span> URL gevalideerd
                      </li>
                      <li
                        className={
                          importState === "loading" ? "is-active" : "has-error"
                        }
                      >
                        <span>{importState === "loading" ? "●" : "!"}</span>{" "}
                        Ophalen, verwerken en opslaan
                      </li>
                      <li>
                        <span>○</span> Serverbevestiging ontvangen
                      </li>
                    </ol>
                  </div>
                ) : null}
                {wizard === "success" && importedDeck ? (
                  <div className="deck-import-success">
                    <span
                      className="deck-import-success__check"
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                    <h3>{importedDeck.name} is toegevoegd</h3>
                    <p>Je deck staat veilig in je persoonlijke Deck Library.</p>
                    <div className="deck-import-success__meta">
                      <span>Archidekt</span>
                      {importedDeck.format ? (
                        <span>{importedDeck.format}</span>
                      ) : null}
                      <span>{importedDeck.cardCount} kaarten</span>
                    </div>
                  </div>
                ) : null}
              </div>
              <footer className="deck-wizard__footer">
                {wizard === "provider" ? (
                  <>
                    <button
                      className="button button--secondary"
                      onClick={closeWizard}
                    >
                      Annuleren
                    </button>
                    <button
                      className="button button--primary"
                      disabled={!providerSelected}
                      onClick={() => {
                        setWizard("reference")
                      }}
                    >
                      Verder <span aria-hidden="true">→</span>
                    </button>
                  </>
                ) : null}
                {wizard === "reference" ? (
                  <>
                    <button
                      className="button button--secondary"
                      onClick={() => {
                        setWizard("provider")
                      }}
                    >
                      ← Terug
                    </button>
                    <button
                      className="button button--primary"
                      disabled={Boolean(validationError)}
                      onClick={() => void submitImport()}
                    >
                      Import starten
                    </button>
                  </>
                ) : null}
                {wizard === "importing" && importState === "loading" ? (
                  <span className="deck-wizard__waiting">
                    Dit kan enkele seconden duren…
                  </span>
                ) : null}
                {wizard === "importing" && importState === "error" ? (
                  <>
                    <button
                      className="button button--secondary"
                      onClick={() => {
                        setWizard("reference")
                      }}
                    >
                      ← Terug
                    </button>
                    <button
                      className="button button--primary"
                      onClick={() => void submitImport()}
                    >
                      Opnieuw proberen
                    </button>
                  </>
                ) : null}
                {wizard === "success" ? (
                  <>
                    <button
                      className="button button--secondary"
                      onClick={() => {
                        document
                          .getElementById(`deck-${importedDeck?.deckKey ?? ""}`)
                          ?.focus()
                        closeWizard()
                      }}
                    >
                      Deck bekijken
                    </button>
                    <button
                      className="button button--primary"
                      onClick={closeWizard}
                    >
                      Sluiten
                    </button>
                  </>
                ) : null}
              </footer>
            </section>
          </div>
        ) : null}
      </section>
    </AppShell>
  )
}
