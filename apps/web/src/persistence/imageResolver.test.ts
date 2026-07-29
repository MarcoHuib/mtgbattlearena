import type { CardImageRef } from "@mtg/game-core/types"
import { browserAssetCache } from "./assetCache"
import { resolveCardImage } from "./imageResolver"

const image: CardImageRef = {
  assetKey: "card-id:0:normal",
  faceIndex: 0,
  variant: "normal",
  url: "https://cards.scryfall.io/normal/front/c/a/card-id.jpg",
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("resolveCardImage", () => {
  it("laat een runtime-gecachete afbeelding via de service worker lopen", async () => {
    vi.spyOn(browserAssetCache, "match").mockResolvedValue({
      response: new Response(),
      source: "automatic-cache",
    })

    await expect(resolveCardImage(image, false)).resolves.toEqual({
      source: "automatic-cache",
      url: image.url,
    })
  })

  it("gebruikt online direct de externe afbeelding als er geen cache is", async () => {
    vi.spyOn(browserAssetCache, "match").mockResolvedValue(undefined)

    await expect(resolveCardImage(image, true)).resolves.toEqual({
      source: "remote",
      url: image.url,
    })
  })
})
