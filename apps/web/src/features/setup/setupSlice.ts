import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit"
import { importArchidektDeck } from "../../archidekt/client"
import { DeckImportError } from "../../archidekt/errors"
import type { DeckSnapshot, PlayerId } from "@mtg/game-core/types"
import { createImportedDeckSnapshot } from "../decks/deckSnapshots"
import { repositories } from "../../persistence/database"

export type DeckSlotState = {
  playerId: PlayerId
  name: string
  url: string
  status: "idle" | "loading" | "ready" | "error"
  deck: DeckSnapshot | null
  error: string | null
}

export type SetupState = {
  playerOrder: PlayerId[]
  players: Record<PlayerId, DeckSlotState>
  nextPlayerNumber: number
}

const initialSlot = (playerId: PlayerId): DeckSlotState => ({
  playerId,
  name: "",
  url: "",
  status: "idle",
  deck: null,
  error: null,
})

const initialState: SetupState = {
  playerOrder: ["player-1", "player-2"],
  players: {
    "player-1": initialSlot("player-1"),
    "player-2": initialSlot("player-2"),
  },
  nextPlayerNumber: 3,
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
      const deck = createImportedDeckSnapshot(imported)
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
      const slot = state.players[action.payload.playerId]
      if (!slot) return
      slot.url = action.payload.url
      slot.error = null
      if (slot.deck) {
        slot.status = "idle"
        slot.deck = null
      }
    },
    setPlayerName(
      state,
      action: PayloadAction<{ playerId: PlayerId; name: string }>,
    ) {
      const slot = state.players[action.payload.playerId]
      if (slot) slot.name = action.payload.name
    },
    addPlayer(state) {
      if (state.playerOrder.length >= 6) return
      const number = state.nextPlayerNumber
      const playerId = `player-${number}`
      state.nextPlayerNumber += 1
      state.playerOrder.push(playerId)
      state.players[playerId] = initialSlot(playerId)
    },
    removePlayer(state, action: PayloadAction<PlayerId>) {
      if (state.playerOrder.length <= 2) return
      if (!state.players[action.payload]) return
      state.playerOrder = state.playerOrder.filter(
        playerId => playerId !== action.payload,
      )
      state.players = Object.fromEntries(
        Object.entries(state.players).filter(
          ([playerId]) => playerId !== action.payload,
        ),
      )
    },
    clearSetup() {
      return {
        playerOrder: ["player-1", "player-2"],
        players: {
          "player-1": initialSlot("player-1"),
          "player-2": initialSlot("player-2"),
        },
        nextPlayerNumber: 3,
      }
    },
  },
  extraReducers: builder => {
    builder
      .addCase(importDeckForPlayer.pending, (state, action) => {
        const slot = state.players[action.meta.arg.playerId]
        if (!slot) return
        slot.status = "loading"
        slot.error = null
      })
      .addCase(importDeckForPlayer.fulfilled, (state, action) => {
        const slot = state.players[action.payload.playerId]
        if (!slot) return
        slot.status = "ready"
        slot.deck = action.payload.deck
        if (!slot.name.trim()) slot.name = action.payload.deck.name
        slot.error = null
      })
      .addCase(importDeckForPlayer.rejected, (state, action) => {
        const playerId = action.payload?.playerId ?? action.meta.arg.playerId
        const slot = state.players[playerId]
        if (!slot) return
        slot.status = "error"
        slot.error = action.payload?.message ?? "De import werd afgebroken."
      })
  },
})

export const {
  addPlayer,
  clearSetup,
  removePlayer,
  setDeckUrl,
  setPlayerName,
} = setupSlice.actions
