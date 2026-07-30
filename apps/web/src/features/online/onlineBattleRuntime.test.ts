import { personalGameSnapshotSchema } from "@mtg/game-protocol"
import { onlineSnapshotToGameState } from "./onlineBattleRuntime"

const card = (instanceId: string, definitionId: string, name: string) => ({
  instanceId,
  definitionId,
  name,
  tapped: false,
  activeFaceIndex: 0,
  counters: {},
  isCommander: false,
  faces: [
    { name, imageUrl: `https://example.test/${definitionId}-front.jpg` },
    {
      name: `${name} achterkant`,
      imageUrl: `https://example.test/${definitionId}-back.jpg`,
    },
  ],
})

const player = (id: string, battlefield = [card(`${id}-field`, id, id)]) => ({
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
  battlefield,
  graveyard: [],
  exile: [],
  command: [],
})

test("bouwt dezelfde veilige tafelstate zonder verborgen tegenstanderkaarten", () => {
  const snapshot = personalGameSnapshotSchema.parse({
    type: "PERSONAL_SNAPSHOT",
    mode: "online",
    gameId: "online-game",
    version: 4,
    role: "player",
    isHost: false,
    activePlayerId: "p1",
    turnNumber: 2,
    phase: "precombat-main",
    matchStatus: {
      monarchPlayerId: null,
      initiativePlayerId: null,
      dayNight: "none",
    },
    turnOrder: ["p1", "p2"],
    openingHands: {
      p1: { mulliganCount: 0, kept: true },
      p2: { mulliganCount: 0, kept: true },
    },
    players: {
      p1: player("p1"),
      p2: player("p2"),
    },
    privateView: {
      playerId: "p1",
      deckSnapshotId: "deck-p1",
      hand: [card("private-hand-card", "private-definition", "Geheim")],
      revealedLibraryCards: [],
      availableTokens: [],
    },
  })

  const game = onlineSnapshotToGameState(snapshot)

  expect(game.players.p1?.zones.hand).toEqual(["private-hand-card"])
  expect(game.players.p2?.zones.hand).toEqual([])
  expect(game.players.p2?.zones.library).toEqual([])
  expect(game.cardsById["private-hand-card"]).toBeDefined()
  expect(Object.values(game.cardsById)).toHaveLength(3)
  expect(game.cardDefinitionsById["private-definition"]?.faces).toHaveLength(2)
})
