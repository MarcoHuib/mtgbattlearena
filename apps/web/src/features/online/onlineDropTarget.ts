export type OnlineDropTarget = {
  element: HTMLElement
  playerId: string
  zone: string
}

export const findOnlineDropTarget = (
  point: { x: number; y: number },
  elementsFromPoint: (x: number, y: number) => Element[] = (x, y) =>
    document.elementsFromPoint(x, y),
): OnlineDropTarget | null => {
  for (const element of elementsFromPoint(point.x, point.y)) {
    if (element.closest(".online-card--dragging")) continue
    const zone = element.closest<HTMLElement>(
      "[data-online-drop-zone][data-online-player-id]",
    )
    const playerId = zone?.dataset.onlinePlayerId
    const zoneName = zone?.dataset.onlineDropZone
    if (zone && playerId && zoneName) {
      return { element: zone, playerId, zone: zoneName }
    }
  }
  return null
}
