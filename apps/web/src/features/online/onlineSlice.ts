import { createSlice, type PayloadAction } from "@reduxjs/toolkit"
import type {
  PersonalGameSnapshot,
  ProtocolError,
  ServerEvent,
} from "@mtg/game-protocol"
import type { OnlineConnectionStatus } from "./types"

export type OnlineState = {
  gameId: string | null
  connectionStatus: OnlineConnectionStatus
  view: PersonalGameSnapshot | null
  pendingCommandIds: string[]
  lastError: ProtocolError | null
}

const initialState: OnlineState = {
  gameId: null,
  connectionStatus: "disconnected",
  view: null,
  pendingCommandIds: [],
  lastError: null,
}

export const onlineSlice = createSlice({
  name: "online",
  initialState,
  reducers: {
    beginOnlineConnection(state, action: PayloadAction<string>) {
      state.gameId = action.payload
      state.connectionStatus = "connecting"
      state.view = null
      state.pendingCommandIds = []
      state.lastError = null
    },
    setOnlineConnectionStatus(
      state,
      action: PayloadAction<OnlineConnectionStatus>,
    ) {
      state.connectionStatus = action.payload
    },
    queueOnlineCommand(state, action: PayloadAction<string>) {
      if (!state.pendingCommandIds.includes(action.payload)) {
        state.pendingCommandIds.push(action.payload)
      }
      state.lastError = null
    },
    receiveOnlineEvent(state, action: PayloadAction<ServerEvent>) {
      const event = action.payload
      if (event.type === "PERSONAL_SNAPSHOT") {
        state.view = event
        state.connectionStatus = "connected"
        state.lastError = null
        return
      }
      if (event.type === "COMMAND_ACCEPTED") {
        state.pendingCommandIds = state.pendingCommandIds.filter(
          commandId => commandId !== event.commandId,
        )
        return
      }
      if (event.type === "GAME_ABORTED") {
        state.connectionStatus = "disconnected"
        state.pendingCommandIds = []
        return
      }
      state.lastError = event.error
      if (event.commandId) {
        state.pendingCommandIds = state.pendingCommandIds.filter(
          commandId => commandId !== event.commandId,
        )
      }
      if (event.snapshot) {
        state.view = event.snapshot
        state.connectionStatus = "connected"
      }
    },
    setOnlineConnectionError(state, action: PayloadAction<ProtocolError>) {
      state.connectionStatus = "error"
      state.lastError = action.payload
      state.pendingCommandIds = []
    },
    clearOnlineGame() {
      return initialState
    },
  },
})

export const {
  beginOnlineConnection,
  clearOnlineGame,
  queueOnlineCommand,
  receiveOnlineEvent,
  setOnlineConnectionError,
  setOnlineConnectionStatus,
} = onlineSlice.actions
