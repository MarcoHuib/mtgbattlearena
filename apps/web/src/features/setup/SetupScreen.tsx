import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import type {
  CloudDeckMetadata,
  DeckSnapshot,
  PlayerId,
} from "@mtg/game-core/types"
import { commanderDefinitions, deckCardCount } from "@mtg/game-core/decks"
import { useAppDispatch, useAppSelector } from "../../app/hooks"
import { AppLink } from "../../app/router"
import { startBattleFromSetup } from "../../app/thunks"
import { Brand } from "../../components/Brand"
import { StatusBar } from "../../components/StatusBar"
import { DeckSlot } from "./DeckSlot"
import {
  addPlayer,
  setDeckForPlayer,
  setDeckLoading,
  setDeckSelectionError,
} from "./setupSlice"
import type { AuthService } from "../online/types"
import { readRuntimeFirebaseConfig } from "../online/firebaseAuth"
import { createFirestoreCloudDeckRepository } from "../decks/cloudDeckRepository"
import { createCloudDeckSnapshot } from "../decks/deckSnapshots"
import { repositories } from "../../persistence/database"

type SetupScreenProps = {
  auth: AuthService
  onBattleStarted?: () => void
}

export type OfflineDeckChoice = CloudDeckMetadata & {
  localSnapshot?: DeckSnapshot
}

const firebaseConfig = readRuntimeFirebaseConfig()
const cloudRepository = firebaseConfig.configured
  ? createFirestoreCloudDeckRepository(
      firebaseConfig.options,
      import.meta.env.DEV
        ? import.meta.env.VITE_FIRESTORE_EMULATOR_HOST
        : undefined,
    )
  : null

const localChoice = (deck: DeckSnapshot): OfflineDeckChoice => {
  const commanders = commanderDefinitions(deck)
  return {
    deckKey: deck.deckSourceId ?? deck.id,
    provider: deck.source === "local" ? "archidekt" : deck.source,
    externalDeckKey: deck.sourceId,
    sourceUrl: deck.sourceUrl,
    name: deck.name,
    ...(deck.format ? { format: deck.format } : {}),
    ...(commanders.length
      ? { commanderSummary: commanders.map(card => card.name).join(" & ") }
      : {}),
    ...(commanders[0]?.imageRefs[0]
      ? { thumbnailImageRef: commanders[0].imageRefs[0] }
      : {}),
    ...(commanders.flatMap(card => card.colorIdentity ?? []).length
      ? {
          colorIdentity: [
            ...new Set(commanders.flatMap(card => card.colorIdentity ?? [])),
          ],
        }
      : {}),
    cardCount: deckCardCount(deck),
    createdAt: deck.importedAt,
    updatedAt: deck.importedAt,
    localSnapshot: deck,
  }
}

export const SetupScreen = ({ auth, onBattleStarted }: SetupScreenProps) => {
  const dispatch = useAppDispatch()
  const setup = useAppSelector(state => state.setup)
  const authState = useSyncExternalStore(
    auth.subscribe.bind(auth),
    auth.getState.bind(auth),
    auth.getState.bind(auth),
  )
  const [deckChoices, setDeckChoices] = useState<OfflineDeckChoice[]>([])
  const [libraryStatus, setLibraryStatus] = useState<
    "loading" | "ready" | "error"
  >("loading")

  useEffect(() => {
    let disposed = false
    const load = async () => {
      setLibraryStatus("loading")
      try {
        const local = (await repositories.decks.list()).map(localChoice)
        const cloud =
          authState.status === "signed-in" &&
          !authState.user.isAnonymous &&
          cloudRepository
            ? await cloudRepository.list(authState.user.uid)
            : []
        if (disposed) return
        const choices = new Map<string, OfflineDeckChoice>()
        local.forEach(deck => choices.set(deck.deckKey, deck))
        cloud.forEach(deck =>
          choices.set(deck.deckKey, {
            ...deck,
            localSnapshot: choices.get(deck.deckKey)?.localSnapshot,
          }),
        )
        setDeckChoices([...choices.values()])
        setLibraryStatus("ready")
      } catch {
        if (!disposed) setLibraryStatus("error")
      }
    }
    void load()
    return () => {
      disposed = true
    }
  }, [authState])

  const chooseDeck = useCallback(
    async (playerId: PlayerId, choice: OfflineDeckChoice) => {
      dispatch(setDeckLoading(playerId))
      try {
        let snapshot = choice.localSnapshot
        if (!snapshot) {
          if (
            authState.status !== "signed-in" ||
            authState.user.isAnonymous ||
            !cloudRepository
          )
            throw new Error("CLOUD_DECK_UNAVAILABLE")
          const content = await cloudRepository.getContent(
            authState.user.uid,
            choice.deckKey,
          )
          if (!content) throw new Error("CLOUD_DECK_NOT_FOUND")
          snapshot = createCloudDeckSnapshot(choice, content)
          await repositories.decks.save(snapshot)
          setDeckChoices(current =>
            current.map(deck =>
              deck.deckKey === choice.deckKey
                ? { ...deck, localSnapshot: snapshot }
                : deck,
            ),
          )
        }
        dispatch(setDeckForPlayer({ playerId, deck: snapshot }))
      } catch {
        dispatch(
          setDeckSelectionError({
            playerId,
            message:
              "Dit deck kon niet lokaal worden klaargezet. Controleer je verbinding en probeer opnieuw.",
          }),
        )
      }
    },
    [authState, dispatch],
  )
  const canStart = setup.playerOrder.every(playerId => {
    const player = setup.players[playerId]
    return player?.status === "ready" && Boolean(player.name.trim())
  })

  return (
    <main className="setup-screen">
      <header className="app-header">
        <AppLink to="/" className="brand-link">
          <Brand />
        </AppLink>
        <StatusBar />
      </header>
      <section className="setup-hero">
        <div className="setup-hero__copy">
          <span className="eyebrow">2–6 spelers · één lokale tafel</span>
          <h1>Leg je battle klaar.</h1>
          <p>
            Kies decks uit dezelfde Deck Library als online. De geselecteerde
            snapshots worden lokaal bewaard voor offline spelen.
          </p>
        </div>
        <div className="setup-hero__seal" aria-hidden="true">
          <span>VS</span>
        </div>
      </section>
      <section className="deck-grid" aria-label="Decks instellen">
        {setup.playerOrder.map((playerId, index) => (
          <DeckSlot
            key={playerId}
            playerId={playerId}
            number={index + 1}
            canRemove={setup.playerOrder.length > 2}
            deckChoices={deckChoices}
            libraryStatus={libraryStatus}
            onChooseDeck={choice => void chooseDeck(playerId, choice)}
          />
        ))}
      </section>
      <footer className="setup-actions">
        <p>
          Commanders gaan naar de command zone; iedere speler trekt automatisch
          zeven kaarten.
        </p>
        <button
          className="button button--secondary button--large"
          type="button"
          disabled={setup.playerOrder.length >= 6}
          onClick={() => dispatch(addPlayer())}
        >
          Speler toevoegen
        </button>
        <button
          className="button button--primary button--large"
          type="button"
          disabled={!canStart}
          onClick={() => {
            dispatch(startBattleFromSetup())
            onBattleStarted?.()
          }}
        >
          Battle starten
        </button>
      </footer>
    </main>
  )
}
