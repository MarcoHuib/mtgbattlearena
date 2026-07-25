import { createSlice, type PayloadAction } from "@reduxjs/toolkit"
import type { OfflineBattlePackage } from "../../game-core/types"

export type OfflineState = {
  current: OfflineBattlePackage | null
  panelOpen: boolean
}

const initialState: OfflineState = {
  current: null,
  panelOpen: false,
}

export const offlineSlice = createSlice({
  name: "offline",
  initialState,
  reducers: {
    setOfflinePackage(
      state,
      action: PayloadAction<OfflineBattlePackage | null>,
    ) {
      state.current = action.payload
    },
    updateOfflinePackage(state, action: PayloadAction<OfflineBattlePackage>) {
      state.current = action.payload
    },
    setOfflinePanel(state, action: PayloadAction<boolean>) {
      state.panelOpen = action.payload
    },
  },
})

export const { setOfflinePackage, setOfflinePanel, updateOfflinePackage } =
  offlineSlice.actions
