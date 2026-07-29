import { createSlice, type PayloadAction } from "@reduxjs/toolkit"

export type UiState = {
  bootStatus: "loading" | "ready" | "error"
  screen: "setup" | "battle"
  saveStatus: "idle" | "saving" | "saved" | "error"
  lastSavedAt: string | null
  saveError: string | null
  restored: boolean
  selectedCardIds: string[]
}

const initialState: UiState = {
  bootStatus: "loading",
  screen: "setup",
  saveStatus: "idle",
  lastSavedAt: null,
  saveError: null,
  restored: false,
  selectedCardIds: [],
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
      state.selectedCardIds = []
    },
    showBattle(
      state,
      action: PayloadAction<{ restored?: boolean } | undefined>,
    ) {
      state.screen = "battle"
      state.restored = action.payload?.restored ?? false
      state.selectedCardIds = []
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
    toggleCardSelection(state, action: PayloadAction<string>) {
      const index = state.selectedCardIds.indexOf(action.payload)
      if (index >= 0) {
        state.selectedCardIds.splice(index, 1)
      } else {
        state.selectedCardIds.push(action.payload)
      }
    },
    clearCardSelection(state) {
      state.selectedCardIds = []
    },
    setCardSelection(state, action: PayloadAction<string[]>) {
      state.selectedCardIds = [...new Set(action.payload)]
    },
  },
})

export const {
  clearCardSelection,
  setBootStatus,
  setSaveError,
  setSaved,
  setSaving,
  setCardSelection,
  showBattle,
  showSetup,
  toggleCardSelection,
} = uiSlice.actions
