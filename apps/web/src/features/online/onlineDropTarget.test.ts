import { findOnlineDropTarget } from "./onlineDropTarget"

test("kiest de onderliggende dropzone en niet de zone van de gesleepte kaart", () => {
  const hand = document.createElement("section")
  hand.dataset.onlineDropZone = "hand"
  hand.dataset.onlinePlayerId = "player-1"
  const draggingCard = document.createElement("button")
  draggingCard.className = "online-card--dragging"
  hand.append(draggingCard)

  const battlefield = document.createElement("section")
  battlefield.dataset.onlineDropZone = "battlefield"
  battlefield.dataset.onlinePlayerId = "player-1"
  const battlefieldSurface = document.createElement("div")
  battlefieldSurface.className = "zone__cards"
  battlefield.append(battlefieldSurface)

  expect(
    findOnlineDropTarget({ x: 200, y: 300 }, () => [
      draggingCard,
      battlefieldSurface,
    ]),
  ).toMatchObject({
    element: battlefield,
    playerId: "player-1",
    zone: "battlefield",
  })
})
