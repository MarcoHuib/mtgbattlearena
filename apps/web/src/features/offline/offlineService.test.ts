import { offlineAssetFetchUrl } from "./offlineService"

describe("offlineAssetFetchUrl", () => {
  it.each([
    ["e2030e94-c186-4b7d-9924-6d53440244fe", "1783902813"],
    ["207b3d62-2541-4a51-8152-3c54218ab6f7", "1783906140"],
    ["2138b304-4dc0-48bb-a043-6246abafef53", "1783922313"],
    ["5430da88-b72e-4d64-bd3c-b21062cac1c2", "1783912609"],
    ["c2963ce1-f9d8-437a-9489-e0913a8b8d26", "1783904328"],
    ["b66aadb2-cbbb-4150-b4b4-bb0dc5327394", "1783902809"],
    ["f909bd95-58a1-4299-9570-87724145fc85", "1783902798"],
    ["2c65185b-6cf0-451d-985e-56aa45d9a57d", "1784523473"],
  ])(
    "leidt Party time-asset %s via de begrensde lokale imageproxy",
    (cardId, hash) => {
      const proxyUrl = offlineAssetFetchUrl(
        `https://card-images.archidekt.com/normal/front/${cardId[0]}/${cardId[1]}/${cardId}.jpg?${hash}`,
      )
      expect(
        proxyUrl.endsWith(
          `/api/import/archidekt/image/${cardId}?face=front&hash=${hash}`,
        ),
      ).toBe(true)
    },
  )

  it("laat andere of ongeldige asset-URL's ongemoeid", () => {
    const scryfall = "https://cards.scryfall.io/normal/front/f/9/card-id.jpg"
    const invalid =
      "https://card-images.archidekt.com/normal/front/f/9/not-a-uuid.jpg?hash"
    expect(offlineAssetFetchUrl(scryfall)).toBe(scryfall)
    expect(offlineAssetFetchUrl(invalid)).toBe(invalid)
  })
})
