import type { CardDefinition } from "./types"
import { deduplicateImageRefs } from "./assets"

test("dedupliceert assets op kaart, zijde en variant", () => {
  const shared = {
    resolver: 1,
    imageId: "6a9c39e4-a8cf-42dd-8d0e-45634b335546",
    faceIndex: 0,
    variant: "normal" as const,
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
          resolver: 1,
          imageId: "6a9c39e4-a8cf-42dd-8d0e-45634b335546",
          faceIndex: 1,
          variant: "normal",
        },
      ],
    },
  ]
  expect(deduplicateImageRefs(definitions)).toHaveLength(2)
})
