import type { PersonalGameSnapshot } from "@mtg/game-protocol"
import { describe, expect, test } from "vitest"
import {
  beginOnlineConnection,
  onlineSlice,
  queueOnlineCommand,
  receiveOnlineEvent,
} from "./onlineSlice"

const snapshot = (gameId: string, version: number): PersonalGameSnapshot =>
  ({
    type: "PERSONAL_SNAPSHOT",
    mode: "online",
    gameId,
    version,
  }) as PersonalGameSnapshot

describe("online authoritative snapshots", () => {
  test("verwerkt hogere en gelijke resyncversies maar nooit een oudere versie", () => {
    let state = onlineSlice.reducer(undefined, beginOnlineConnection("game-a"))
    state = onlineSlice.reducer(
      state,
      receiveOnlineEvent(snapshot("game-a", 4)),
    )
    expect(state.view?.version).toBe(4)

    state = onlineSlice.reducer(
      state,
      receiveOnlineEvent(snapshot("game-a", 3)),
    )
    expect(state.view?.version).toBe(4)

    state = onlineSlice.reducer(
      state,
      receiveOnlineEvent(snapshot("game-a", 4)),
    )
    expect(state.view?.version).toBe(4)
    expect(state.connectionStatus).toBe("connected")

    state = onlineSlice.reducer(
      state,
      receiveOnlineEvent(snapshot("game-a", 5)),
    )
    expect(state.view?.version).toBe(5)
  })

  test("negeert andere games en laat pending commands snapshots niet blokkeren", () => {
    let state = onlineSlice.reducer(undefined, beginOnlineConnection("game-a"))
    state = onlineSlice.reducer(
      state,
      receiveOnlineEvent(snapshot("game-a", 1)),
    )
    state = onlineSlice.reducer(state, queueOnlineCommand("command-a"))
    state = onlineSlice.reducer(
      state,
      receiveOnlineEvent(snapshot("game-a", 2)),
    )
    expect(state.view?.version).toBe(2)
    expect(state.pendingCommandIds).toEqual(["command-a"])

    state = onlineSlice.reducer(
      state,
      receiveOnlineEvent(snapshot("game-b", 9)),
    )
    expect(state.view?.gameId).toBe("game-a")
    expect(state.view?.version).toBe(2)
  })
})
