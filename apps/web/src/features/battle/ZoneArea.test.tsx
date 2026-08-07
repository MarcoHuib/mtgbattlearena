import { DragDropProvider } from "@dnd-kit/react"
import { fireEvent, screen } from "@testing-library/react"
import { vi } from "vitest"
import type {
  CardDefinition,
  CardInstance,
  GameState,
} from "@mtg/game-core/types"
import { renderWithProviders } from "../../utils/test-utils"
import { BattleRuntimeProvider, type BattleRuntime } from "./BattleRuntime"
import { ZoneArea } from "./ZoneArea"

const definitions: Record<string, CardDefinition> = {
  first: {
    id: "first",
    name: "Eerste kaart",
    faces: [{ name: "Eerste kaart" }],
    imageRefs: [],
  },
  last: {
    id: "last",
    name: "Laatste kaart",
    faces: [{ name: "Laatste kaart" }],
    imageRefs: [],
  },
}

const instance = (instanceId: string, definitionId: string): CardInstance => ({
  instanceId,
  definitionId,
  ownerId: "player-1",
  controllerId: "player-1",
  zone: "graveyard",
  tapped: false,
  faceDown: false,
  activeFaceIndex: 0,
  counters: {},
})

test("toont op een open stapel alleen de laatst toegevoegde kaart", () => {
  const cards = [instance("one", "first"), instance("two", "last")]
  const game = {
    players: {
      "player-1": {
        zones: {
          library: [],
          hand: [],
          battlefield: [],
          graveyard: cards.map(card => card.instanceId),
          exile: [],
          command: [],
        },
      },
    },
    cardsById: Object.fromEntries(cards.map(card => [card.instanceId, card])),
    cardDefinitionsById: definitions,
    groupsById: {},
  } as unknown as GameState
  const runtime = {
    mode: "offline",
    game,
    viewerPlayerId: "player-1",
    controllablePlayerIds: new Set(["player-1"]),
    hiddenZoneCounts: {},
    selectedCardIds: [],
    setSelectedCardIds: () => undefined,
    pending: false,
    actions: {},
  } as unknown as BattleRuntime
  renderWithProviders(
    <BattleRuntimeProvider runtime={runtime}>
      <DragDropProvider>
        <ZoneArea
          playerId="player-1"
          zone="graveyard"
          title="Graveyard"
          instances={cards}
          definitions={definitions}
          faceUpStack
        />
      </DragDropProvider>
    </BattleRuntimeProvider>,
  )

  expect(screen.getByLabelText("Graveyard, 2 kaarten")).toBeInTheDocument()
  expect(screen.getByLabelText("Laatste kaart, Graveyard")).toBeInTheDocument()
  expect(
    screen.queryByLabelText("Eerste kaart, Graveyard"),
  ).not.toBeInTheDocument()
})

test("rechtermuisklik op een open stapel opent het zonemenu", () => {
  const cards = [instance("one", "first"), instance("two", "last")]
  const game = {
    players: {
      "player-1": {
        zones: {
          library: [],
          hand: [],
          battlefield: [],
          graveyard: cards.map(card => card.instanceId),
          exile: [],
          command: [],
        },
      },
    },
    cardsById: Object.fromEntries(cards.map(card => [card.instanceId, card])),
    cardDefinitionsById: definitions,
    groupsById: {},
  } as unknown as GameState
  const runtime = {
    mode: "offline",
    game,
    viewerPlayerId: "player-1",
    controllablePlayerIds: new Set(["player-1"]),
    hiddenZoneCounts: {},
    selectedCardIds: [],
    setSelectedCardIds: vi.fn(),
    pending: false,
    actions: {},
  } as unknown as BattleRuntime
  renderWithProviders(
    <BattleRuntimeProvider runtime={runtime}>
      <DragDropProvider>
        <ZoneArea
          playerId="player-1"
          zone="graveyard"
          title="Graveyard"
          instances={cards}
          definitions={definitions}
          faceUpStack
          onOpen={vi.fn()}
          onSearch={vi.fn()}
        />
      </DragDropProvider>
    </BattleRuntimeProvider>,
  )

  fireEvent.contextMenu(screen.getByLabelText("Laatste kaart, Graveyard"))
  expect(screen.getByRole("menu")).toBeInTheDocument()
  expect(
    screen.queryByRole("dialog", { name: /Kaartacties/ }),
  ).not.toBeInTheDocument()
})
