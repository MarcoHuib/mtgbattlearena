import { createPerspectiveTableSeats, createTableSeats } from "./tableSeats"

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
  ])(
    "plaatst %i spelers per opeenvolgend paar in kolommen",
    (count, expected) => {
      expect(positions(count)).toEqual(expected)
    },
  )

  it.each([
    ["player-a", "player-b"],
    ["player-b", "player-a"],
  ])("plaatst lokale speler %s onderaan tegenover %s", (local, opponent) => {
    const seats = createPerspectiveTableSeats(["player-a", "player-b"], local)
    expect(seats).toEqual([
      {
        playerId: opponent,
        row: "top",
        columnIndex: 0,
        oppositePlayerId: local,
      },
      {
        playerId: local,
        row: "bottom",
        columnIndex: 0,
        oppositePlayerId: opponent,
      },
    ])
  })

  it("houdt de lokale speler bij zes spelers onderaan in de eerste kolom", () => {
    const seats = createPerspectiveTableSeats(
      ["p1", "p2", "p3", "p4", "p5", "p6"],
      "p4",
    )
    expect(seats.find(seat => seat.playerId === "p4")).toMatchObject({
      row: "bottom",
      columnIndex: 0,
      oppositePlayerId: "p3",
    })
    expect(seats.map(seat => seat.playerId)).toEqual([
      "p3",
      "p4",
      "p5",
      "p6",
      "p1",
      "p2",
    ])
  })

  it("behoudt de absolute seatvolgorde voor spectators", () => {
    expect(createPerspectiveTableSeats(["p1", "p2", "p3"], null)).toEqual(
      createTableSeats(["p1", "p2", "p3"]),
    )
  })
})
