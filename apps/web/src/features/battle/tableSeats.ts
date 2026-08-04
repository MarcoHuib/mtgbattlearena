import type { PlayerId } from "@mtg/game-core/types"

export type TableSeat = {
  playerId: PlayerId
  row: "top" | "bottom"
  columnIndex: number
  oppositePlayerId: PlayerId | null
}

export const createTableSeats = (
  playerIds: readonly PlayerId[],
): TableSeat[] =>
  playerIds.map((playerId, index) => {
    const isTop = index % 2 === 0
    const oppositePlayerId = playerIds[isTop ? index + 1 : index - 1] ?? null
    return {
      playerId,
      row: isTop ? "top" : "bottom",
      columnIndex: Math.floor(index / 2),
      oppositePlayerId,
    }
  })
