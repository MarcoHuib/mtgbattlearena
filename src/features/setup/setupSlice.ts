import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit"
import { importArchidektDeck } from "../../archidekt/client"
import { DeckImportError } from "../../archidekt/errors"
import { createDeckSnapshot } from "../../game-core/decks"
import type { DeckSnapshot, PlayerId } from "../../game-core/types"
import { repositories } from "../../persistence/database"

export type DeckSlotState = {
  url: string
  status: "idle" | "loading" | "ready" | "error"
  deck: DeckSnapshot | null
  error: string | null
}

export type SetupState = Record<PlayerId, DeckSlotState>

const initialSlot = (): DeckSlotState => ({
  url: "",
  status: "idle",
  deck: null,
  error: null,
})

const initialState: SetupState = {
  "player-1": initialSlot(),
  "player-2": initialSlot(),
}

export const importDeckForPlayer = createAsyncThunk<
  { playerId: PlayerId; deck: DeckSnapshot },
  { playerId: PlayerId; url: string },
  { rejectValue: { playerId: PlayerId; message: string } }
>(
  "setup/importDeck",
  async ({ playerId, url }, { rejectWithValue, signal }) => {
    try {
      const imported = await importArchidektDeck(url, signal)
      const deck = createDeckSnapshot(imported, `deck-${crypto.randomUUID()}`)
      await repositories.decks.save(deck)
      return { playerId, deck }
    } catch (error) {
      return rejectWithValue({
        playerId,
        message:
          error instanceof DeckImportError
            ? error.message
            : "Het deck kon niet worden geïmporteerd.",
      })
    }
  },
)

export const setupSlice = createSlice({
  name: "setup",
  initialState,
  reducers: {
    setDeckUrl(
      state,
      action: PayloadAction<{ playerId: PlayerId; url: string }>,
    ) {
      const slot = state[action.payload.playerId]
      slot.url = action.payload.url
      slot.error = null
      if (slot.deck) {
        slot.status = "idle"
        slot.deck = null
      }
    },
    clearSetup() {
      return initialState
    },
  },
  extraReducers: builder => {
    builder
      .addCase(importDeckForPlayer.pending, (state, action) => {
        const slot = state[action.meta.arg.playerId]
        slot.status = "loading"
        slot.error = null
      })
      .addCase(importDeckForPlayer.fulfilled, (state, action) => {
        const slot = state[action.payload.playerId]
        slot.status = "ready"
        slot.deck = action.payload.deck
        slot.error = null
      })
      .addCase(importDeckForPlayer.rejected, (state, action) => {
        const playerId = action.payload?.playerId ?? action.meta.arg.playerId
        const slot = state[playerId]
        slot.status = "error"
        slot.error = action.payload?.message ?? "De import werd afgebroken."
      })
  },
})

export const { clearSetup, setDeckUrl } = setupSlice.actions
