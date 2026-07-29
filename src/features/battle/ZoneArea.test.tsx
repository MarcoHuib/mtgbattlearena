import { DragDropProvider } from "@dnd-kit/react"
import { screen } from "@testing-library/react"
import type { CardDefinition, CardInstance } from "../../game-core/types"
import { renderWithProviders } from "../../utils/test-utils"
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
  renderWithProviders(
    <DragDropProvider>
      <ZoneArea
        playerId="player-1"
        zone="graveyard"
        title="Graveyard"
        instances={[instance("one", "first"), instance("two", "last")]}
        definitions={definitions}
        faceUpStack
      />
    </DragDropProvider>,
  )

  expect(screen.getByLabelText("Graveyard, 2 kaarten")).toBeInTheDocument()
  expect(screen.getByLabelText("Laatste kaart, Graveyard")).toBeInTheDocument()
  expect(
    screen.queryByLabelText("Eerste kaart, Graveyard"),
  ).not.toBeInTheDocument()
})
