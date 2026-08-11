import type { ServerEvent } from "@mtg/game-protocol"

export type OnlineGraphQLTag = "LobbyList" | { type: "Lobby"; id: string }

export const graphQLTagsForServerEvent = (
  event: ServerEvent,
  hadGameSnapshot: boolean,
): OnlineGraphQLTag[] => {
  if (event.type === "GAME_ABORTED") {
    return ["LobbyList", { type: "Lobby", id: event.gameId }]
  }
  if (event.type === "PERSONAL_SNAPSHOT") {
    return hadGameSnapshot
      ? []
      : ["LobbyList", { type: "Lobby", id: event.gameId }]
  }
  return []
}
