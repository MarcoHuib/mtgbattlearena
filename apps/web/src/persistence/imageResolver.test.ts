import type { CardImageRef } from "@mtg/game-core/types"
import { browserAssetCache } from "./assetCache"
import { resolveCardImage } from "./imageResolver"

const image: CardImageRef = {
  resolver: 1,
  imageId: "6a9c39e4-a8cf-42dd-8d0e-45634b335546",
  faceIndex: 0,
  variant: "normal",
}
const cdnUrl = "https://cdn.mtgbattlearena.nl/v1/1/6a9c39e4-a8cf-42dd-8d0e-45634b335546/0/normal.webp"

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
      url: cdnUrl,
    })
  })

  it("gebruikt online direct de externe afbeelding als er geen cache is", async () => {
    vi.spyOn(browserAssetCache, "match").mockResolvedValue(undefined)

    await expect(resolveCardImage(image, true)).resolves.toEqual({
      source: "remote",
      url: cdnUrl,
    })
  })
})
