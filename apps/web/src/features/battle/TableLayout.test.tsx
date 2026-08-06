import { render } from "@testing-library/react"
import { vi } from "vitest"
import { TableLayout } from "./TableLayout"

vi.mock("./MatchStatusBar", () => ({
  MatchStatusBar: () => <div>Matchstatus</div>,
}))

describe("TableLayout-perspectief", () => {
  it.each([
    ["player-a", "player-b"],
    ["player-b", "player-a"],
  ])("rendert lokale speler %s onder en %s boven", (local, opponent) => {
    const { container, unmount } = render(
      <TableLayout
        playerIds={["player-a", "player-b"]}
        perspectivePlayerId={local}
        renderSeat={seat => <div>{seat.playerId}</div>}
      />,
    )

    const ownSeat = container.querySelector(`[data-seat-player="${local}"]`)
    const opponentSeat = container.querySelector(
      `[data-seat-player="${opponent}"]`,
    )
    expect(ownSeat).toHaveAttribute("data-seat-row", "bottom")
    expect(opponentSeat).toHaveAttribute("data-seat-row", "top")
    expect(container.querySelector(".table-layout")).toHaveAttribute(
      "data-perspective-player",
      local,
    )
    unmount()
  })
})
