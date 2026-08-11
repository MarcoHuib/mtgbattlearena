import { getCardImageUrl } from "@mtg/game-core/images"

test("offline assets use the MTG Battle Arena CDN boundary", () => {
  expect(getCardImageUrl({ resolver: 1, imageId: "6a9c39e4-a8cf-42dd-8d0e-45634b335546", faceIndex: 0, variant: "normal" }))
    .toBe("https://cdn.mtgbattlearena.nl/v1/1/6a9c39e4-a8cf-42dd-8d0e-45634b335546/0/normal.webp")
})
