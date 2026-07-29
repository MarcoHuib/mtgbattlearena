import type { CardDefinition } from "./types"
import { deduplicateImageRefs } from "./assets"

test("dedupliceert assets op kaart, zijde en variant", () => {
  const shared = {
    assetKey: "card:0:normal",
    faceIndex: 0,
    variant: "normal" as const,
    url: "https://cards.test/card.jpg",
  }
  const definitions: CardDefinition[] = [
    { id: "one", name: "One", faces: [{ name: "One" }], imageRefs: [shared] },
    {
      id: "two",
      name: "Two",
      faces: [{ name: "Two" }],
      imageRefs: [
        shared,
        {
          assetKey: "card:1:normal",
          faceIndex: 1,
          variant: "normal",
          url: "https://cards.test/back.jpg",
        },
      ],
    },
  ]
  expect(deduplicateImageRefs(definitions)).toHaveLength(2)
})
