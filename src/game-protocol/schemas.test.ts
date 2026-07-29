import { gameCommandSchema, personalGameSnapshotSchema } from "./schemas"

const visibleCard = {
  instanceId: "instance-public",
  definitionId: "definition-public",
  name: "Command Tower",
  tapped: false,
  activeFaceIndex: 0,
  counters: {},
  isCommander: false,
}

const player = (id: string) => ({
  id,
  displayName: id,
  life: 40,
  poison: 0,
  handCount: 7,
  libraryCount: 92,
  battlefield: [visibleCard],
  graveyard: [],
  exile: [],
  command: [],
})

test("valideert versioned commands zonder betrouwbare clientidentiteit", () => {
  const command = gameCommandSchema.parse({
    type: "DRAW_CARD",
    commandId: "e34e485c-35f2-4ad7-90b2-e693df5426ea",
    expectedVersion: 12,
    payload: { amount: 1 },
  })
  expect(command.expectedVersion).toBe(12)
  expect("playerId" in command).toBe(false)
  expect(() =>
    gameCommandSchema.parse({
      ...command,
      uid: "door-client-gekozen",
    }),
  ).toThrow()
})

test("valideert alle speelbare online basiscommands strikt", () => {
  const base = {
    commandId: "e34e485c-35f2-4ad7-90b2-e693df5426ea",
    expectedVersion: 12,
  }
  const commands = [
    { ...base, type: "DRAW_CARD", payload: { amount: 1 } },
    {
      ...base,
      type: "MOVE_CARD",
      payload: { instanceId: "card", zone: "battlefield" },
    },
    { ...base, type: "CHANGE_LIFE", payload: { delta: -1 } },
    { ...base, type: "CHANGE_POISON", payload: { delta: 1 } },
    { ...base, type: "MILL", payload: { amount: 2 } },
    { ...base, type: "SHUFFLE_LIBRARY", payload: {} },
    { ...base, type: "PASS_TURN", payload: {} },
  ]
  expect(
    commands.map(command => gameCommandSchema.parse(command).type),
  ).toEqual([
    "DRAW_CARD",
    "MOVE_CARD",
    "CHANGE_LIFE",
    "CHANGE_POISON",
    "MILL",
    "SHUFFLE_LIBRARY",
    "PASS_TURN",
  ])
  expect(() =>
    gameCommandSchema.parse({
      ...commands[0],
      payload: { amount: 1, playerId: "p2" },
    }),
  ).toThrow()
})

test("persoonlijke snapshots ondersteunen 2–6 spelers en één private view", () => {
  const turnOrder = ["p1", "p2", "p3", "p4"]
  const snapshot = personalGameSnapshotSchema.parse({
    type: "PERSONAL_SNAPSHOT",
    mode: "online",
    gameId: "game",
    version: 9,
    role: "player",
    activePlayerId: "p2",
    turnNumber: 3,
    turnOrder,
    players: Object.fromEntries(turnOrder.map(id => [id, player(id)])),
    privateView: {
      playerId: "p1",
      hand: [visibleCard],
      revealedLibraryCards: [],
    },
  })
  expect(snapshot.turnOrder).toHaveLength(4)
  expect(snapshot.players.p2?.handCount).toBe(7)
  expect("hand" in (snapshot.players.p2 ?? {})).toBe(false)
})

test("weigert verborgen tegenstanderdata en spectator-private-state", () => {
  const base = {
    type: "PERSONAL_SNAPSHOT",
    mode: "online",
    gameId: "game",
    version: 1,
    activePlayerId: "p1",
    turnNumber: 1,
    turnOrder: ["p1", "p2"],
    players: {
      p1: player("p1"),
      p2: { ...player("p2"), hand: [visibleCard] },
    },
  }
  expect(() =>
    personalGameSnapshotSchema.parse({
      ...base,
      role: "player",
      privateView: {
        playerId: "p1",
        hand: [visibleCard],
        revealedLibraryCards: [],
      },
    }),
  ).toThrow()
  expect(() =>
    personalGameSnapshotSchema.parse({
      ...base,
      players: { p1: player("p1"), p2: player("p2") },
      role: "spectator",
      privateView: {
        playerId: "p1",
        hand: [visibleCard],
        revealedLibraryCards: [],
      },
    }),
  ).toThrow()
})
