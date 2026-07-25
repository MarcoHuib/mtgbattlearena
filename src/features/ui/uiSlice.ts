import { createSlice, type PayloadAction } from "@reduxjs/toolkit"

export type UiState = {
  bootStatus: "loading" | "ready" | "error"
  screen: "setup" | "battle"
  saveStatus: "idle" | "saving" | "saved" | "error"
  lastSavedAt: string | null
  saveError: string | null
  restored: boolean
}

const initialState: UiState = {
  bootStatus: "loading",
  screen: "setup",
  saveStatus: "idle",
  lastSavedAt: null,
  saveError: null,
  restored: false,
}

export const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setBootStatus(state, action: PayloadAction<UiState["bootStatus"]>) {
      state.bootStatus = action.payload
    },
    showSetup(state) {
      state.screen = "setup"
      state.restored = false
    },
    showBattle(
      state,
      action: PayloadAction<{ restored?: boolean } | undefined>,
    ) {
      state.screen = "battle"
      state.restored = action.payload?.restored ?? false
    },
    setSaving(state) {
      state.saveStatus = "saving"
      state.saveError = null
    },
    setSaved(state, action: PayloadAction<string>) {
      state.saveStatus = "saved"
      state.lastSavedAt = action.payload
      state.saveError = null
    },
    setSaveError(state, action: PayloadAction<string>) {
      state.saveStatus = "error"
      state.saveError = action.payload
    },
  },
})

export const {
  setBootStatus,
  setSaveError,
  setSaved,
  setSaving,
  showBattle,
  showSetup,
} = uiSlice.actions
