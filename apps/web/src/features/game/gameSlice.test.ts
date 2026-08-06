import { archidektFixture } from "../../archidekt/fixtures"
import { normalizeArchidektDeck } from "../../archidekt/adapter"
import { createDeckSnapshot } from "@mtg/game-core/decks"
import { createGame } from "@mtg/game-core/game"
import {
  attach,
  changeLife,
  createGroup,
  gameSlice,
  moveGameCards,
  redo,
  setCitysBlessing,
  setDayNight,
  setInitiative,
  setMonarch,
  setTrackerVisibility,
  startGame,
  switchFace,
  undo,
} from "./gameSlice"

test("kan de laatste relevante gameactie ongedaan maken", () => {
  const imported = normalizeArchidektDeck(archidektFixture, "1")
  const deck = createDeckSnapshot(imported, "deck")
  let id = 0
  const game = createGame([deck, deck], {
    random: () => 0.3,
    createId: prefix => `${prefix}-${(id += 1)}`,
    now: "2026-01-01T00:00:00.000Z",
  })
  let state = gameSlice.reducer(undefined, startGame(game))
  state = gameSlice.reducer(
    state,
    changeLife({ playerId: "player-1", delta: -1 }),
  )
  expect(state.present?.players["player-1"].life).toBe(39)
  state = gameSlice.reducer(state, undo())
  expect(state.present?.players["player-1"].life).toBe(40)
})

test("undo en redo herstellen de actieve kaartzijde", () => {
  const imported = normalizeArchidektDeck(archidektFixture, "1")
  const deck = createDeckSnapshot(imported, "deck")
  let id = 0
  const created = createGame([deck, deck], {
    random: () => 0.3,
    createId: prefix => `${prefix}-${(id += 1)}`,
    now: "2026-01-01T00:00:00.000Z",
  })
  const cardId = created.players["player-1"].zones.hand[0]!
  const definitionId = created.cardsById[cardId]!.definitionId
  const game = {
    ...created,
    cardDefinitionsById: {
      ...created.cardDefinitionsById,
      [definitionId]: {
        ...created.cardDefinitionsById[definitionId]!,
        faces: [
          ...created.cardDefinitionsById[definitionId]!.faces,
          { name: "Achterzijde" },
        ],
      },
    },
  }
  let state = gameSlice.reducer(undefined, startGame(game))
  state = gameSlice.reducer(
    state,
    moveGameCards({
      moves: [
        { instanceId: cardId, playerId: "player-1", zone: "battlefield" },
      ],
    }),
  )
  state = gameSlice.reducer(state, switchFace({ instanceId: cardId }))
  expect(state.present?.cardsById[cardId]?.activeFaceIndex).toBe(1)
  state = gameSlice.reducer(state, undo())
  expect(state.present?.cardsById[cardId]?.activeFaceIndex).toBe(0)
  state = gameSlice.reducer(state, redo())
  expect(state.present?.cardsById[cardId]?.activeFaceIndex).toBe(1)
})

test("undo en redo behandelen multiselect als één relevante spelactie", () => {
  const imported = normalizeArchidektDeck(archidektFixture, "1")
  const deck = createDeckSnapshot(imported, "deck")
  let id = 0
  const game = createGame([deck, deck], {
    random: () => 0.3,
    createId: prefix => `${prefix}-${(id += 1)}`,
    now: "2026-01-01T00:00:00.000Z",
  })
  const [first, second] = game.players["player-1"].zones.hand
  let state = gameSlice.reducer(undefined, startGame(game))
  state = gameSlice.reducer(
    state,
    moveGameCards({
      moves: [first!, second!].map((instanceId, index) => ({
        instanceId,
        playerId: "player-1",
        zone: "battlefield",
        position: { x: 0.3 + index * 0.2, y: 0.5, z: index },
      })),
    }),
  )
  expect(state.present?.players["player-1"].zones.battlefield).toEqual([
    first,
    second,
  ])
  expect(state.past).toHaveLength(1)

  state = gameSlice.reducer(state, undo())
  expect(state.present?.players["player-1"].zones.hand).toContain(first)
  expect(state.present?.players["player-1"].zones.hand).toContain(second)

  state = gameSlice.reducer(state, redo())
  expect(state.present?.players["player-1"].zones.battlefield).toEqual([
    first,
    second,
  ])
})

test("undo en redo herstellen attachments en permanente groepen", () => {
  const imported = normalizeArchidektDeck(archidektFixture, "1")
  const deck = createDeckSnapshot(imported, "deck")
  let id = 0
  const game = createGame([deck, deck], {
    random: () => 0.3,
    createId: prefix => `${prefix}-${(id += 1)}`,
    now: "2026-01-01T00:00:00.000Z",
  })
  const [first, second] = game.players["player-1"].zones.hand
  let state = gameSlice.reducer(undefined, startGame(game))
  state = gameSlice.reducer(
    state,
    moveGameCards({
      moves: [first!, second!].map((instanceId, index) => ({
        instanceId,
        playerId: "player-1",
        zone: "battlefield",
        position: { x: 0.3 + index * 0.2, y: 0.5, z: index },
      })),
    }),
  )
  state = gameSlice.reducer(
    state,
    attach({ attachmentId: first!, targetId: second! }),
  )
  state = gameSlice.reducer(
    state,
    createGroup({
      groupId: "group",
      playerId: "player-1",
      cardIds: [first!, second!],
      name: "Lands",
    }),
  )
  expect(state.present?.cardsById[first!]?.attachedTo).toBe(second)
  expect(state.present?.groupsById.group?.name).toBe("Lands")

  state = gameSlice.reducer(state, undo())
  expect(state.present?.groupsById.group).toBeUndefined()
  state = gameSlice.reducer(state, undo())
  expect(state.present?.cardsById[first!]?.attachedTo).toBeUndefined()
  state = gameSlice.reducer(state, redo())
  expect(state.present?.cardsById[first!]?.attachedTo).toBe(second)
})

test("undo en redo herstellen spelertrackers en centrale matchstatus", () => {
  const imported = normalizeArchidektDeck(archidektFixture, "1")
  const deck = createDeckSnapshot(imported, "deck")
  let id = 0
  const game = createGame([deck, deck], {
    random: () => 0.3,
    createId: prefix => `${prefix}-${(id += 1)}`,
    now: "2026-01-01T00:00:00.000Z",
  })
  let state = gameSlice.reducer(undefined, startGame(game))
  state = gameSlice.reducer(
    state,
    setTrackerVisibility({
      playerId: "player-1",
      tracker: "experience",
      visible: true,
    }),
  )
  state = gameSlice.reducer(
    state,
    setCitysBlessing({ playerId: "player-1", active: true }),
  )
  state = gameSlice.reducer(state, setMonarch({ playerId: "player-1" }))
  state = gameSlice.reducer(state, setInitiative({ playerId: "player-2" }))
  state = gameSlice.reducer(state, setDayNight({ status: "day" }))

  expect(state.present?.matchStatus).toEqual({
    monarchPlayerId: "player-1",
    initiativePlayerId: "player-2",
    dayNight: "day",
  })
  expect(state.present?.players["player-1"].visibleTrackers.experience).toBe(
    true,
  )

  state = gameSlice.reducer(state, undo())
  expect(state.present?.matchStatus.dayNight).toBe("none")
  state = gameSlice.reducer(state, redo())
  expect(state.present?.matchStatus.dayNight).toBe("day")
})
