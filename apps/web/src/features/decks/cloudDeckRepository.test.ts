import {
  cloudDeckThumbnailUrl,
  normalizeCloudDeckMetadata,
} from "./cloudDeckRepository"

const image = {
  resolver: 1,
  imageId: "00000000-0000-4000-8000-000000000001",
  faceIndex: 0,
  variant: "normal",
}

test.each([
  ["native Firestorevelden", image, ["W", "B", "R"]],
  ["legacy JSON-tekstvelden", JSON.stringify(image), '["W","B","R"]'],
])("normaliseert %s voor thumbnail en kleuren", (_label, thumbnail, colors) => {
  const deck = normalizeCloudDeckMetadata("deck-1", {
    provider: "archidekt",
    externalDeckKey: "42",
    sourceUrl: "https://archidekt.com/decks/42",
    name: "Edgar",
    thumbnailImageRef: thumbnail,
    colorIdentity: colors,
    cardCount: 100,
    createdAt: "2026-08-13T10:00:00.000Z",
    updatedAt: "2026-08-13T10:00:00.000Z",
  })

  expect(deck.thumbnailImageRef).toEqual(image)
  expect(deck.colorIdentity).toEqual(["W", "B", "R"])
  expect(cloudDeckThumbnailUrl(deck)).toContain(
    "/v1/1/00000000-0000-4000-8000-000000000001/0/normal",
  )
})

test("een ongeldige legacy-thumbnail crasht de UI niet", () => {
  const deck = normalizeCloudDeckMetadata("deck-1", {
    name: "Legacy",
    thumbnailImageRef: '{"faceIndex":0,"variant":"normal"}',
    colorIdentity: "not-json",
  })

  expect(deck.thumbnailImageRef).toBeUndefined()
  expect(deck.colorIdentity).toBeUndefined()
  expect(cloudDeckThumbnailUrl(deck)).toBeNull()
})
