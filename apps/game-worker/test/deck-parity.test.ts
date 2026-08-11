import { createGameForPlayers } from "@mtg/game-core/game"
import type { DeckSnapshot, GameState } from "@mtg/game-core/types"
import { createOnlineDeckSubmission } from "@mtg/game-protocol"
import { createAuthoritativeGame } from "../src/game-server-adapter"

const deck: DeckSnapshot = {
  id: "parity-deck",
  schemaVersion: 1,
  source: "archidekt",
  sourceId: "42",
  sourceUrl: "https://archidekt.com/decks/42",
  sourceHash: "semantic-hash",
  name: "Parity",
  importedAt: "2026-01-01T00:00:00.000Z",
  cards: [
    { definitionId: "commander-a", quantity: 1, isCommander: true },
    { definitionId: "commander-b", quantity: 1, isCommander: true },
    { definitionId: "double-faced", quantity: 2, isCommander: false },
    { definitionId: "minimal", quantity: 3, isCommander: false },
  ],
  definitions: [
    {
      id: "commander-a",
      name: "Partner A",
      faces: [{ name: "Partner A" }],
      imageRefs: [],
    },
    {
      id: "commander-b",
      name: "Partner B",
      faces: [{ name: "Partner B" }],
      imageRefs: [],
    },
    {
      id: "double-faced",
      name: "Front",
      layout: "transform",
      faces: [
        { name: "Front", imageUrl: "https://cards.test/front.jpg" },
        { name: "Back", imageUrl: "https://cards.test/back.jpg" },
      ],
      imageRefs: [],
    },
    {
      id: "minimal",
      name: "Minimal",
      faces: [{ name: "Minimal" }],
      imageRefs: [],
    },
    {
      id: "treasure",
      name: "Treasure",
      faces: [{ name: "Treasure" }],
      imageRefs: [],
      token: { kind: "treasure", name: "Treasure", source: "deck" },
    },
  ],
}

const semantic = (
  game: Pick<GameState, "players" | "cardsById" | "cardDefinitionsById">,
  playerId: string,
) => {
  const player = game.players[playerId]!
  const cards = Object.values(game.cardsById)
    .filter(card => card.ownerId === playerId)
    .map(card => ({
      definitionId: card.definitionId.replace(`${playerId}:`, ""),
      commander: card.isCommander === true,
      zoneClass: card.zone === "command" ? "command" : "deck",
      faces: game.cardDefinitionsById[card.definitionId]?.faces.map(
        face => face.name,
      ),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  const tokens = Object.values(game.cardDefinitionsById)
    .filter(
      item =>
        item.id.startsWith(`${playerId}:`) && item.token?.source === "deck",
    )
    .map(item => ({
      id: item.id.replace(`${playerId}:`, ""),
      token: item.token,
      faces: item.faces,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
  return { cards, tokens, commanderCount: player.zones.command.length }
}

test("offline en online delen deckinterpretatie voor commanders, aantallen, DFCs, tokens en defaults", () => {
  let offlineId = 0
  const offline = createGameForPlayers(
    [
      { id: "p1", name: "One", deck },
      { id: "p2", name: "Two", deck },
    ],
    {
      random: () => 0.5,
      createId: prefix => `${prefix}-${++offlineId}`,
      now: "2026-01-01T00:00:00.000Z",
    },
  )
  const submission = createOnlineDeckSubmission(deck)
  let onlineId = 0
  const online = createAuthoritativeGame(
    {
      gameId: "online",
      title: "Parity",
      players: [
        { ...submission, playerId: "p1", uid: "u1", displayName: "One" },
        { ...submission, playerId: "p2", uid: "u2", displayName: "Two" },
      ],
    },
    {
      random: () => 0.5,
      createId: prefix => `${prefix}-${++onlineId}`,
      now: () => "2026-01-01T00:00:00.000Z",
    },
  )
  expect(semantic(online, "p1")).toEqual(semantic(offline, "p1"))
  expect(semantic(online, "p1").commanderCount).toBe(2)
})
