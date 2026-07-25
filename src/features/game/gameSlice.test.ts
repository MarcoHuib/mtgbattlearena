import { archidektFixture } from "../../archidekt/fixtures"
import { normalizeArchidektDeck } from "../../archidekt/adapter"
import { createDeckSnapshot } from "../../game-core/decks"
import { createGame } from "../../game-core/game"
import {
  changeLife,
  gameSlice,
  moveGameCards,
  redo,
  startGame,
  undo,
} from "./gameSlice"

test("kan de laatste relevante gameactie ongedaan maken", () => {
  const imported = normalizeArchidektDeck(archidektFixture, "1")
  const deck = createDeckSnapshot(imported, "deck")
  let id = 0
  const game = createGame([deck, deck], {
    random: () => 0.3,
    createId: prefix => `${prefix}-${(id += 1)}`,
    now: "2026-01-01T00:00:00.000Z",
  })
  let state = gameSlice.reducer(undefined, startGame(game))
  state = gameSlice.reducer(
    state,
    changeLife({ playerId: "player-1", delta: -1 }),
  )
  expect(state.present?.players["player-1"].life).toBe(39)
  state = gameSlice.reducer(state, undo())
  expect(state.present?.players["player-1"].life).toBe(40)
})

test("undo en redo behandelen multiselect als één relevante spelactie", () => {
  const imported = normalizeArchidektDeck(archidektFixture, "1")
  const deck = createDeckSnapshot(imported, "deck")
  let id = 0
  const game = createGame([deck, deck], {
    random: () => 0.3,
    createId: prefix => `${prefix}-${(id += 1)}`,
    now: "2026-01-01T00:00:00.000Z",
  })
  const [first, second] = game.players["player-1"].zones.hand
  let state = gameSlice.reducer(undefined, startGame(game))
  state = gameSlice.reducer(
    state,
    moveGameCards({
      moves: [first!, second!].map((instanceId, index) => ({
        instanceId,
        playerId: "player-1",
        zone: "battlefield",
        position: { x: 0.3 + index * 0.2, y: 0.5, z: index },
      })),
    }),
  )
  expect(state.present?.players["player-1"].zones.battlefield).toEqual([
    first,
    second,
  ])
  expect(state.past).toHaveLength(1)

  state = gameSlice.reducer(state, undo())
  expect(state.present?.players["player-1"].zones.hand).toContain(first)
  expect(state.present?.players["player-1"].zones.hand).toContain(second)

  state = gameSlice.reducer(state, redo())
  expect(state.present?.players["player-1"].zones.battlefield).toEqual([
    first,
    second,
  ])
})
