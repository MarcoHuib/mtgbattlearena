import {
  addPlayer,
  clearSetup,
  removePlayer,
  setupSlice,
  setPlayerName,
} from "./setupSlice"

describe("offline setup", () => {
  it("beheert een stabiele spelerslijst tussen twee en zes seats", () => {
    let state = setupSlice.reducer(undefined, clearSetup())
    expect(state.playerOrder).toEqual(["player-1", "player-2"])

    state = setupSlice.reducer(state, addPlayer())
    state = setupSlice.reducer(state, addPlayer())
    state = setupSlice.reducer(state, addPlayer())
    state = setupSlice.reducer(state, addPlayer())
    state = setupSlice.reducer(state, addPlayer())
    expect(state.playerOrder).toEqual([
      "player-1",
      "player-2",
      "player-3",
      "player-4",
      "player-5",
      "player-6",
    ])

    state = setupSlice.reducer(
      state,
      setPlayerName({ playerId: "player-4", name: "Marco" }),
    )
    state = setupSlice.reducer(state, removePlayer("player-3"))
    expect(state.players["player-4"]?.name).toBe("Marco")
    expect(state.playerOrder).not.toContain("player-3")

    while (state.playerOrder.length > 2) {
      state = setupSlice.reducer(state, removePlayer(state.playerOrder.at(-1)!))
    }
    const unchanged = setupSlice.reducer(
      state,
      removePlayer(state.playerOrder[0]!),
    )
    expect(unchanged.playerOrder).toHaveLength(2)
  })
})
