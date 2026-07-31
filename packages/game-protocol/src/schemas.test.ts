import {
  gameCommandSchema,
  onlineDeckSubmissionSchema,
  personalGameSnapshotSchema,
} from "./schemas"

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
  trackers: { energy: 0, experience: 0, rad: 0 },
  visibleTrackers: { energy: false, experience: false, rad: false },
  citysBlessing: false,
  disabled: false,
  commanderTax: {},
  commanderDamage: {},
  handCount: 7,
  libraryCount: 92,
  battlefield: [visibleCard],
  graveyard: [],
  exile: [],
  command: [],
})

const completedFirstPlayerRoll = (
  playerIds: string[],
  winner = playerIds[0],
) => ({
  status: "completed",
  round: 1,
  participantIds: playerIds,
  eligiblePlayerIds: [],
  rolls: {},
  eliminatedPlayerIds: [],
  tiedPlayerIds: [],
  winnerPlayerId: winner,
  startPlayerId: winner,
  rollSequence: 0,
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

test("valideert één eigen deckregistratie zonder clientidentiteit of seat", () => {
  const deck = onlineDeckSubmissionSchema.parse({
    deckSnapshotId: "deck-snapshot",
    deckName: "Mijn Commander-deck",
    cards: [
      {
        definitionId: "commander",
        name: "Atraxa",
        faces: [
          { name: "Atraxa", imageUrl: "https://example.test/front.jpg" },
          { name: "Atraxa, Compleated", oracleText: "Andere zijde" },
        ],
        quantity: 1,
        isCommander: true,
      },
    ],
  })
  expect(deck.deckName).toBe("Mijn Commander-deck")
  expect(deck.tokens).toEqual([])
  expect(deck.cards[0]?.faces).toHaveLength(2)
  expect("uid" in deck).toBe(false)
  expect("playerId" in deck).toBe(false)
  expect(() =>
    onlineDeckSubmissionSchema.parse({
      ...deck,
      cards: [...deck.cards, deck.cards[0]],
    }),
  ).toThrow()
})

test("valideert alle speelbare online basiscommands strikt", () => {
  const base = {
    commandId: "e34e485c-35f2-4ad7-90b2-e693df5426ea",
    expectedVersion: 12,
  }
  const commands = [
    { ...base, type: "ROLL_FOR_FIRST_PLAYER", payload: {} },
    { ...base, type: "COMPLETE_FIRST_PLAYER_ROLL", payload: {} },
    { ...base, type: "MULLIGAN_HAND", payload: {} },
    { ...base, type: "KEEP_HAND", payload: {} },
    { ...base, type: "DRAW_CARD", payload: { amount: 1 } },
    {
      ...base,
      type: "MOVE_CARD",
      payload: { instanceId: "card", zone: "battlefield" },
    },
    {
      ...base,
      type: "MOVE_CARDS",
      payload: {
        moves: [
          {
            instanceId: "card",
            zone: "battlefield",
            position: { x: 0.5, y: 0.5, z: 1 },
          },
        ],
      },
    },
    {
      ...base,
      type: "MOVE_CARD_IN_LIBRARY",
      payload: { instanceId: "card", position: "top" },
    },
    { ...base, type: "CHANGE_LIFE", payload: { delta: -1 } },
    { ...base, type: "CHANGE_POISON", payload: { delta: 1 } },
    { ...base, type: "MILL", payload: { amount: 2 } },
    { ...base, type: "SHUFFLE_LIBRARY", payload: {} },
    { ...base, type: "REVEAL_LIBRARY", payload: { amount: 7 } },
    { ...base, type: "HIDE_LIBRARY", payload: {} },
    { ...base, type: "UNTAP_ALL", payload: {} },
    {
      ...base,
      type: "CREATE_TOKEN",
      payload: {
        token: {
          definitionId: "treasure-token",
          name: "Treasure",
          kind: "treasure",
        },
        position: { x: 0.5, y: 0.5, z: 1 },
      },
    },
    {
      ...base,
      type: "CHANGE_TRACKER",
      payload: { tracker: "energy", delta: 1 },
    },
    {
      ...base,
      type: "SET_TRACKER_VISIBILITY",
      payload: { tracker: "energy", visible: true },
    },
    { ...base, type: "SET_CITYS_BLESSING", payload: { active: true } },
    { ...base, type: "SET_PLAYER_DISABLED", payload: { disabled: true } },
    {
      ...base,
      type: "CHANGE_COMMANDER_TAX",
      payload: { commanderId: "card", delta: 2 },
    },
    {
      ...base,
      type: "CHANGE_COMMANDER_DAMAGE",
      payload: { commanderId: "opponent-card", delta: 1 },
    },
    { ...base, type: "TOGGLE_TAP", payload: { instanceId: "card" } },
    {
      ...base,
      type: "TOGGLE_TAP",
      payload: { instanceIds: ["card", "card-2"] },
    },
    {
      ...base,
      type: "SET_COUNTER",
      payload: { instanceId: "card", counter: "+1/+1", value: 2 },
    },
    { ...base, type: "SWITCH_FACE", payload: { instanceId: "card" } },
    {
      ...base,
      type: "SET_STACK_ORDER",
      payload: { instanceId: "card", direction: "front" },
    },
    {
      ...base,
      type: "ATTACH_CARD",
      payload: { attachmentId: "card", targetId: "card-2" },
    },
    { ...base, type: "DETACH_CARD", payload: { attachmentId: "card" } },
    { ...base, type: "DUPLICATE_TOKEN", payload: { instanceId: "card" } },
    {
      ...base,
      type: "CREATE_GROUP",
      payload: { cardIds: ["card", "card-2"], name: "Aanvallers" },
    },
    {
      ...base,
      type: "ADD_TO_GROUP",
      payload: { groupId: "group", cardIds: ["card"] },
    },
    {
      ...base,
      type: "REMOVE_FROM_GROUP",
      payload: { groupId: "group", cardIds: ["card"] },
    },
    {
      ...base,
      type: "UPDATE_GROUP",
      payload: { groupId: "group", collapsed: true },
    },
    {
      ...base,
      type: "MOVE_GROUP",
      payload: {
        groupId: "group",
        position: { x: 0.4, y: 0.6, z: 2 },
      },
    },
    { ...base, type: "DISSOLVE_GROUP", payload: { groupId: "group" } },
    { ...base, type: "PASS_TURN", payload: {} },
    { ...base, type: "NEXT_PHASE", payload: {} },
    { ...base, type: "SET_MONARCH", payload: { playerId: "p1" } },
    { ...base, type: "SET_INITIATIVE", payload: { playerId: null } },
    { ...base, type: "SET_DAY_NIGHT", payload: { status: "day" } },
  ]
  expect(
    commands.map(command => gameCommandSchema.parse(command).type),
  ).toEqual([
    "ROLL_FOR_FIRST_PLAYER",
    "COMPLETE_FIRST_PLAYER_ROLL",
    "MULLIGAN_HAND",
    "KEEP_HAND",
    "DRAW_CARD",
    "MOVE_CARD",
    "MOVE_CARDS",
    "MOVE_CARD_IN_LIBRARY",
    "CHANGE_LIFE",
    "CHANGE_POISON",
    "MILL",
    "SHUFFLE_LIBRARY",
    "REVEAL_LIBRARY",
    "HIDE_LIBRARY",
    "UNTAP_ALL",
    "CREATE_TOKEN",
    "CHANGE_TRACKER",
    "SET_TRACKER_VISIBILITY",
    "SET_CITYS_BLESSING",
    "SET_PLAYER_DISABLED",
    "CHANGE_COMMANDER_TAX",
    "CHANGE_COMMANDER_DAMAGE",
    "TOGGLE_TAP",
    "TOGGLE_TAP",
    "SET_COUNTER",
    "SWITCH_FACE",
    "SET_STACK_ORDER",
    "ATTACH_CARD",
    "DETACH_CARD",
    "DUPLICATE_TOKEN",
    "CREATE_GROUP",
    "ADD_TO_GROUP",
    "REMOVE_FROM_GROUP",
    "UPDATE_GROUP",
    "MOVE_GROUP",
    "DISSOLVE_GROUP",
    "PASS_TURN",
    "NEXT_PHASE",
    "SET_MONARCH",
    "SET_INITIATIVE",
    "SET_DAY_NIGHT",
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
    isHost: false,
    activePlayerId: "p2",
    turnNumber: 3,
    phase: "combat",
    matchStatus: {
      monarchPlayerId: "p2",
      initiativePlayerId: null,
      dayNight: "day",
    },
    firstPlayerRoll: completedFirstPlayerRoll(turnOrder, "p2"),
    turnOrder,
    openingHands: Object.fromEntries(
      turnOrder.map(id => [id, { mulliganCount: 0, kept: true }]),
    ),
    players: Object.fromEntries(turnOrder.map(id => [id, player(id)])),
    privateView: {
      playerId: "p1",
      deckSnapshotId: "deck-p1",
      hand: [visibleCard],
      revealedLibraryCards: [],
      availableTokens: [],
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
    isHost: false,
    activePlayerId: "p1",
    turnNumber: 1,
    phase: "beginning",
    matchStatus: {
      monarchPlayerId: null,
      initiativePlayerId: null,
      dayNight: "none",
    },
    firstPlayerRoll: completedFirstPlayerRoll(["p1", "p2"]),
    turnOrder: ["p1", "p2"],
    openingHands: {
      p1: { mulliganCount: 0, kept: true },
      p2: { mulliganCount: 0, kept: true },
    },
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
