import { createTableSeats } from "./tableSeats"

const positions = (count: number) =>
  createTableSeats(
    Array.from({ length: count }, (_, index) => `player-${index + 1}`),
  ).map(seat => [
    seat.playerId,
    seat.row,
    seat.columnIndex,
    seat.oppositePlayerId,
  ])

describe("createTableSeats", () => {
  it.each([
    [
      2,
      [
        ["player-1", "top", 0, "player-2"],
        ["player-2", "bottom", 0, "player-1"],
      ],
    ],
    [
      3,
      [
        ["player-1", "top", 0, "player-2"],
        ["player-2", "bottom", 0, "player-1"],
        ["player-3", "top", 1, null],
      ],
    ],
    [
      5,
      [
        ["player-1", "top", 0, "player-2"],
        ["player-2", "bottom", 0, "player-1"],
        ["player-3", "top", 1, "player-4"],
        ["player-4", "bottom", 1, "player-3"],
        ["player-5", "top", 2, null],
      ],
    ],
    [
      6,
      [
        ["player-1", "top", 0, "player-2"],
        ["player-2", "bottom", 0, "player-1"],
        ["player-3", "top", 1, "player-4"],
        ["player-4", "bottom", 1, "player-3"],
        ["player-5", "top", 2, "player-6"],
        ["player-6", "bottom", 2, "player-5"],
      ],
    ],
  ])("plaatst %i spelers per opeenvolgend paar in kolommen", (count, expected) => {
    expect(positions(count)).toEqual(expected)
  })
})
