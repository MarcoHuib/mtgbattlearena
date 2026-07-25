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
    schemaVersion: 3,
    game: {
      schemaVersion: 3,
      id: "game",
      activePlayerId: "player-1",
      turnNumber: 1,
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
    schemaVersion: 3,
    game: {
      schemaVersion: 3,
      activePlayerId: "player-2",
      turnNumber: 4,
      openingHands: {
        "player-1": { kept: true },
        "player-2": { kept: true },
      },
    },
  })
})
