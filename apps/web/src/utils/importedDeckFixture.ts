import type { ImportedDeck } from "@mtg/game-core/types"

export const importedDeckFixture = (
  sourceId = "12345",
  name = "Verdant Resolve",
): ImportedDeck => ({
  source: "archidekt",
  sourceId,
  sourceUrl: `https://archidekt.com/decks/${sourceId}`,
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
      name: "Aesi, Tyrant of Gyre Strait",
      faces: [
        {
          name: "Aesi, Tyrant of Gyre Strait",
          typeLine: "Legendary Creature",
        },
      ],
      imageRefs: [
        {
          resolver: 1,
          imageId: "00000000-0000-4000-8000-000000000099",
          faceIndex: 0,
          variant: "normal" as const,
        },
      ],
    },
    ...Array.from({ length: 12 }, (_, index) => ({
      id: `card-${index + 1}`,
      name: `Forest Memory ${index + 1}`,
      faces: [{ name: `Forest Memory ${index + 1}` }],
      imageRefs: [
        {
          resolver: 1 as const,
          imageId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          faceIndex: 0,
          variant: "normal" as const,
        },
      ],
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
          resolver: 1 as const,
          imageId: "f909bd95-58a1-4299-9570-87724145fc85",
          faceIndex: 0,
          variant: "normal",
        },
      ],
      token: { kind: "treasure", name: "Treasure", source: "deck" },
    },
  ],
})
