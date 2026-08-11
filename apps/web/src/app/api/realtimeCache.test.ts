import { graphQLTagsForServerEvent } from "./realtimeCache"
import type { PersonalGameSnapshot } from "@mtg/game-protocol"

const personalSnapshotFixture = {
  type: "PERSONAL_SNAPSHOT",
  gameId: "game-1",
} as PersonalGameSnapshot

test("eerste WebSocket-snapshot invalideert lobby en snapshotcache", () => {
  expect(graphQLTagsForServerEvent(personalSnapshotFixture, false)).toEqual([
    "LobbyList",
    { type: "Lobby", id: personalSnapshotFixture.gameId },
  ])
})

test("latere gamestate-events blijven exclusief in de WebSocket-state", () => {
  expect(graphQLTagsForServerEvent(personalSnapshotFixture, true)).toEqual([])
  expect(
    graphQLTagsForServerEvent(
      {
        type: "COMMAND_ACCEPTED",
        gameId: personalSnapshotFixture.gameId,
        commandId: "8e912143-8514-4e76-b9b7-2f77a2ec7501",
        version: 2,
      },
      true,
    ),
  ).toEqual([])
})

test("GAME_ABORTED invalideert alle representaties van de game", () => {
  expect(
    graphQLTagsForServerEvent(
      {
        type: "GAME_ABORTED",
        gameId: "game-1",
        message: "Game afgebroken.",
      },
      true,
    ),
  ).toEqual(["LobbyList", { type: "Lobby", id: "game-1" }])
})
