import type { ImportedDeck } from "@mtg/game-core/types"

export const importedDeckFixture = (
  sourceId = "12345",
  name = "Verdant Resolve",
): ImportedDeck => ({
  source: "archidekt",
  sourceId,
  sourceUrl: `https://archidekt.com/decks/${sourceId}`,
  sourceHash: `hash-${sourceId}`,
  name,
  importedAt: "2026-01-01T00:00:00.000Z",
  cards: [
    { definitionId: "commander-1", quantity: 1, isCommander: true },
    ...Array.from({ length: 12 }, (_, index) => ({
      definitionId: `card-${index + 1}`,
      quantity: 1,
      isCommander: false,
    })),
  ],
  definitions: [
    {
      id: "commander-1",
      name: "Aesi",
      faces: [{ name: "Aesi", typeLine: "Legendary Creature" }],
      imageRefs: [],
    },
    ...Array.from({ length: 12 }, (_, index) => ({
      id: `card-${index + 1}`,
      name: `Forest Memory ${index + 1}`,
      faces: [{ name: `Forest Memory ${index + 1}` }],
      imageRefs: [],
    })),
    {
      id: "token-treasure",
      name: "Treasure",
      faces: [
        {
          name: "Treasure",
          typeLine: "Token Artifact — Treasure",
        },
      ],
      imageRefs: [
        {
          resolver: 1,
          imageId: "f909bd95-58a1-4299-9570-87724145fc85",
          faceIndex: 0,
          variant: "normal",
        },
      ],
      token: { kind: "treasure", name: "Treasure", source: "deck" },
    },
  ],
})
