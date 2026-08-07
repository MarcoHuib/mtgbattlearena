import { DragDropProvider } from "@dnd-kit/react"
import { fireEvent, screen, waitFor } from "@testing-library/react"
import { vi } from "vitest"
import type {
  CardDefinition,
  CardInstance,
  GameState,
} from "@mtg/game-core/types"
import { renderWithProviders } from "../../utils/test-utils"
import { BattleRuntimeProvider, type BattleRuntime } from "./BattleRuntime"
import { CardView } from "./CardView"

vi.mock("../../persistence/imageResolver", () => ({
  resolveCardImage: vi.fn((image?: { url: string }) =>
    Promise.resolve(image ? { source: "remote", url: image.url } : null),
  ),
}))

const definition: CardDefinition = {
  id: "edgar",
  name: "Edgar, Charmed Groom",
  layout: "transform",
  faces: [
    {
      name: "Edgar, Charmed Groom",
      imageUrl: "https://img.test/front.jpg",
    },
    {
      name: "Edgar Markov's Coffin",
      imageUrl: "https://img.test/back.jpg",
    },
  ],
  imageRefs: [
    {
      assetKey: "edgar:0:normal",
      faceIndex: 0,
      variant: "normal",
      url: "https://img.test/front.jpg",
    },
    {
      assetKey: "edgar:1:normal",
      faceIndex: 1,
      variant: "normal",
      url: "https://img.test/back.jpg",
    },
  ],
}

const instance: CardInstance = {
  instanceId: "edgar-1",
  definitionId: definition.id,
  ownerId: "player-1",
  controllerId: "player-1",
  zone: "battlefield",
  tapped: true,
  faceDown: false,
  activeFaceIndex: 0,
  counters: { bloodline: 2 },
  position: { x: 0.3, y: 0.4, z: 2 },
}

const renderCard = (cardDefinition = definition, controllable = true) => {
  const switchFace = vi.fn()
  const game = {
    players: {
      "player-1": {
        zones: {
          library: [],
          hand: [],
          battlefield: [instance.instanceId],
          graveyard: [],
          exile: [],
          command: [],
        },
      },
    },
    cardsById: { [instance.instanceId]: instance },
    cardDefinitionsById: { [cardDefinition.id]: cardDefinition },
    groupsById: {},
  } as unknown as GameState
  const runtime = {
    mode: "offline",
    game,
    viewerPlayerId: "player-1",
    controllablePlayerIds: new Set(controllable ? ["player-1"] : []),
    hiddenZoneCounts: {},
    selectedCardIds: [],
    setSelectedCardIds: vi.fn(),
    pending: false,
    actions: {
      switchFace,
      toggleTap: vi.fn(),
      changeStackOrder: vi.fn(),
      attach: vi.fn(),
      detach: vi.fn(),
      moveCards: vi.fn(),
      setCounter: vi.fn(),
    },
  } as unknown as BattleRuntime
  renderWithProviders(
    <BattleRuntimeProvider runtime={runtime}>
      <DragDropProvider>
        <CardView instance={instance} definition={cardDefinition} />
      </DragDropProvider>
    </BattleRuntimeProvider>,
  )
  return { switchFace }
}

test("previewflip blijft lokale UI-state en reset bij opnieuw openen", async () => {
  const { switchFace } = renderCard()
  const card = screen.getByLabelText(/Edgar, Charmed Groom, Battlefield/)
  fireEvent.contextMenu(card, { clientX: 100, clientY: 100 })

  expect(
    await screen.findByAltText("Edgar, Charmed Groom, grote kaartpreview"),
  ).toBeInTheDocument()
  fireEvent.click(
    screen.getByRole("button", {
      name: /Toon Edgar Markov's Coffin in preview/,
    }),
  )
  expect(
    await screen.findByAltText("Edgar Markov's Coffin, grote kaartpreview"),
  ).toBeInTheDocument()
  expect(switchFace).not.toHaveBeenCalled()
  expect(instance.activeFaceIndex).toBe(0)

  fireEvent.click(screen.getByRole("button", { name: "Kaartacties sluiten" }))
  fireEvent.contextMenu(card, { clientX: 100, clientY: 100 })
  expect(
    await screen.findByAltText("Edgar, Charmed Groom, grote kaartpreview"),
  ).toBeInTheDocument()

  fireEvent.click(
    screen.getByRole("button", {
      name: "Draai Edgar, Charmed Groom om op het battlefield",
    }),
  )
  expect(switchFace).toHaveBeenCalledWith(instance.instanceId)
  await waitFor(() => expect(card).toHaveFocus())
})

test("enkelzijdige kaart toont geen flipacties", async () => {
  renderCard({
    ...definition,
    faces: [definition.faces[0]!],
    imageRefs: [definition.imageRefs[0]!],
  })
  fireEvent.contextMenu(
    screen.getByLabelText(/Edgar, Charmed Groom, Battlefield/),
  )
  await screen.findByAltText("Edgar, Charmed Groom, grote kaartpreview")
  expect(screen.queryByText("Kaart omdraaien")).not.toBeInTheDocument()
  expect(screen.queryByText("Andere zijde bekijken")).not.toBeInTheDocument()
})

test("tegenstanderskaart opent een alleen-lezen preview met lokale faceflip", async () => {
  const { switchFace } = renderCard(definition, false)
  fireEvent.contextMenu(
    screen.getByLabelText(/Edgar, Charmed Groom, Battlefield/),
  )

  expect(
    await screen.findByText(/Je bekijkt een kaart van een andere speler/),
  ).toBeInTheDocument()
  expect(screen.queryByText("Kaart omdraaien")).not.toBeInTheDocument()
  fireEvent.click(
    screen.getByRole("button", {
      name: /Toon Edgar Markov's Coffin in preview/,
    }),
  )
  expect(
    await screen.findByAltText("Edgar Markov's Coffin, grote kaartpreview"),
  ).toBeInTheDocument()
  expect(switchFace).not.toHaveBeenCalled()
})
