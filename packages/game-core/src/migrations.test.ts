import { hydratePersistedGame } from "./migrations"

test("migreert een versie 1-savegame met veilige beurtdefaults", () => {
  const stored = {
    schemaVersion: 1,
    game: { schemaVersion: 1, id: "game" },
    past: [],
    future: [],
    savedAt: "2026-01-01T00:00:00.000Z",
  }
  const hydrated = hydratePersistedGame(JSON.parse(JSON.stringify(stored)))
  expect(hydrated).toMatchObject({
    schemaVersion: 7,
    game: {
      schemaVersion: 7,
      id: "game",
      activePlayerId: "player-1",
      turnNumber: 1,
      phase: "beginning",
      openingHands: {
        "player-1": { mulliganCount: 0, kept: true },
        "player-2": { mulliganCount: 0, kept: true },
      },
    },
  })
  expect(() => hydratePersistedGame({ ...stored, schemaVersion: 99 })).toThrow(
    "onbekend formaat",
  )
})

test("hervat een versie 2-battle zonder opnieuw een openingshand te vragen", () => {
  const stored = {
    schemaVersion: 2,
    game: {
      schemaVersion: 2,
      id: "game",
      activePlayerId: "player-2",
      turnNumber: 4,
    },
    past: [],
    future: [],
    savedAt: "2026-01-02T00:00:00.000Z",
  }

  expect(hydratePersistedGame(stored)).toMatchObject({
    schemaVersion: 7,
    game: {
      schemaVersion: 7,
      activePlayerId: "player-2",
      turnNumber: 4,
      phase: "beginning",
      openingHands: {
        "player-1": { kept: true },
        "player-2": { kept: true },
      },
    },
  })
})

test("migreert versie 3 met commander- en poisondefaults zonder zones te verliezen", () => {
  const zones = {
    library: ["library-card"],
    hand: [],
    battlefield: [],
    graveyard: [],
    exile: [],
    command: ["commander-card"],
  }
  const stored = {
    schemaVersion: 3,
    game: {
      schemaVersion: 3,
      id: "game",
      activePlayerId: "player-1",
      turnNumber: 2,
      openingHands: {
        "player-1": { mulliganCount: 1, kept: true },
        "player-2": { mulliganCount: 0, kept: true },
      },
      players: {
        "player-1": { id: "player-1", life: 37, zones },
        "player-2": {
          id: "player-2",
          life: 40,
          zones: { ...zones, command: [] },
        },
      },
    },
    past: [],
    future: [],
    savedAt: "2026-01-03T00:00:00.000Z",
  }

  expect(hydratePersistedGame(stored)).toMatchObject({
    schemaVersion: 7,
    game: {
      schemaVersion: 7,
      phase: "beginning",
      players: {
        "player-1": {
          life: 37,
          poison: 0,
          trackers: { energy: 0, experience: 0, rad: 0 },
          visibleTrackers: { energy: false, experience: false, rad: false },
          citysBlessing: false,
          disabled: false,
          commanderTax: { "commander-card": 0 },
          commanderDamage: {},
          zones: { command: ["commander-card"] },
        },
      },
    },
  })
})

test("behoudt fase-2-data bij serialisatie en hydratatie", () => {
  const stored = {
    schemaVersion: 4,
    game: {
      schemaVersion: 4,
      id: "game",
      activePlayerId: "player-2",
      turnNumber: 8,
      phase: "combat",
      openingHands: {
        "player-1": { mulliganCount: 0, kept: true },
        "player-2": { mulliganCount: 1, kept: true },
      },
      players: {
        "player-1": {
          poison: 2,
          commanderTax: { commander: 4 },
          commanderDamage: { opponentCommander: 12 },
        },
      },
      cardsById: {
        token: {
          instanceId: "token",
          counters: { shield: 2 },
          position: { x: 0.42, y: 0.73, z: 9 },
        },
      },
    },
    past: [],
    future: [],
    savedAt: "2026-01-04T00:00:00.000Z",
  }

  const hydrated = hydratePersistedGame(stored)
  expect(hydrated.game).toMatchObject({
    schemaVersion: 7,
    groupsById: {},
    phase: "combat",
    players: {
      "player-1": {
        poison: 2,
        commanderTax: { commander: 4 },
        commanderDamage: { opponentCommander: 12 },
      },
    },
    cardsById: {
      token: {
        counters: { shield: 2 },
        position: { x: 0.42, y: 0.73, z: 9 },
      },
    },
  })
})

test("migreert versie 4 naar groepen en ruimt ongeldige attachments op", () => {
  const card = {
    instanceId: "card",
    definitionId: "definition",
    ownerId: "player-1",
    controllerId: "player-1",
    zone: "graveyard",
    tapped: false,
    faceDown: false,
    activeFaceIndex: 0,
    counters: {},
    attachedTo: "missing",
  }
  const stored = {
    schemaVersion: 4,
    game: {
      schemaVersion: 4,
      id: "game",
      activePlayerId: "player-1",
      turnNumber: 1,
      phase: "beginning",
      openingHands: {
        "player-1": { mulliganCount: 0, kept: true },
        "player-2": { mulliganCount: 0, kept: true },
      },
      cardsById: { card },
    },
    past: [],
    future: [],
    savedAt: "2026-01-05T00:00:00.000Z",
  }

  const hydrated = hydratePersistedGame(stored)
  expect(hydrated).toMatchObject({
    schemaVersion: 7,
    game: {
      schemaVersion: 7,
      groupsById: {},
      cardsById: { card: { attachedTo: undefined } },
    },
  })
})

test("migreert versie 5 naar centrale matchstatus en spelertrackers", () => {
  const player = {
    id: "player-1",
    name: "Speler",
    deckSnapshotId: "deck",
    life: 12,
    poison: 3,
    commanderTax: {},
    commanderDamage: {},
    zones: {
      library: [],
      hand: [],
      battlefield: [],
      graveyard: [],
      exile: [],
      command: [],
    },
  }
  const game = {
    schemaVersion: 5,
    id: "game",
    title: "Battle",
    createdAt: "2026-01-06T00:00:00.000Z",
    updatedAt: "2026-01-06T00:00:00.000Z",
    activePlayerId: "player-1",
    turnNumber: 2,
    phase: "combat",
    openingHands: {
      "player-1": { mulliganCount: 0, kept: true },
      "player-2": { mulliganCount: 0, kept: true },
    },
    deckSnapshotIds: ["deck-1", "deck-2"],
    players: {
      "player-1": player,
      "player-2": { ...player, id: "player-2" },
    },
    cardDefinitionsById: {},
    cardsById: {},
    groupsById: {},
  }

  const hydrated = hydratePersistedGame({
    schemaVersion: 5,
    game,
    past: [game],
    future: [],
    savedAt: "2026-01-06T00:00:00.000Z",
  })

  expect(hydrated).toMatchObject({
    schemaVersion: 7,
    game: {
      schemaVersion: 7,
      matchStatus: {
        monarchPlayerId: null,
        initiativePlayerId: null,
        dayNight: "none",
      },
      firstPlayerRoll: {
        status: "completed",
        startPlayerId: "player-1",
      },
      players: {
        "player-1": {
          life: 12,
          trackers: { energy: 0, experience: 0, rad: 0 },
          visibleTrackers: { energy: false, experience: false, rad: false },
          citysBlessing: false,
          disabled: false,
        },
      },
    },
    past: [{ schemaVersion: 7 }],
  })
})
