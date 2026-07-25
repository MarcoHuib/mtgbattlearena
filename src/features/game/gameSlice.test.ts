import { archidektFixture } from "../../archidekt/fixtures"
import { normalizeArchidektDeck } from "../../archidekt/adapter"
import { createDeckSnapshot } from "../../game-core/decks"
import { createGame } from "../../game-core/game"
import { changeLife, gameSlice, startGame, undo } from "./gameSlice"

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
