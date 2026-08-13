import { describe, expect, test } from "vitest"
import {
  getCardImageUrl,
  normalizeCardImageRef,
  normalizeCardImages,
} from "./images"
import type { CardDefinition } from "./types"

const forest = "d232fcc2-12f6-401a-b1aa-ddff11cb9378"
const ghalta = "6a9c39e4-a8cf-42dd-8d0e-45634b335546"

describe("legacy image compatibility", () => {
  test("preserves a current ImageRef idempotently", () => {
    const current = {
      resolver: 1,
      imageId: ghalta,
      faceIndex: 0,
      variant: "normal" as const,
    }
    expect(normalizeCardImageRef(current)).toEqual(current)
    expect(normalizeCardImageRef(normalizeCardImageRef(current))).toEqual(
      current,
    )
  })

  test("recovers a validated legacy assetKey and ignores its URL", () => {
    const legacy = {
      assetKey: `${forest}:0:normal`,
      faceIndex: 0,
      variant: "normal" as const,
      url: "https://attacker.invalid/not-used.jpg",
    }
    const normalized = normalizeCardImageRef(legacy)
    expect(normalized).toEqual({
      resolver: 1,
      imageId: forest,
      faceIndex: 0,
      variant: "normal",
    })
    expect(getCardImageUrl(normalized!)).toBe(
      `https://cdn.mtgbattlearena.nl/v1/1/${forest}/0/normal`,
    )
  })

  test("uses an explicit printing ID before assetKey recovery", () => {
    expect(
      normalizeCardImageRef(
        { assetKey: `${forest}:0:normal`, faceIndex: 0, variant: "normal" },
        ghalta,
      ),
    ).toMatchObject({ imageId: ghalta })
  })

  test.each([
    "not-a-uuid:0:normal",
    `${forest}:2:normal`,
    `${forest}:0:large`,
    `https://card-images.archidekt.com/${forest}:0:normal`,
  ])("rejects malformed legacy assetKey %s", assetKey => {
    expect(
      normalizeCardImageRef({ assetKey, faceIndex: 0, variant: "normal" }),
    ).toBeUndefined()
  })

  test("normalizes a legacy definition and removes provider fields", () => {
    const legacy = {
      id: "forest",
      name: "Forest",
      scryfallId: forest,
      faces: [{ name: "Forest", imageUrl: "https://ignored.invalid/a.jpg" }],
      imageRefs: [],
    } satisfies CardDefinition
    const normalized = normalizeCardImages(legacy)
    expect(normalized.imageRefs).toEqual([
      { resolver: 1, imageId: forest, faceIndex: 0, variant: "normal" },
    ])
    expect(normalized).not.toHaveProperty("scryfallId")
    expect(normalized.faces[0]).not.toHaveProperty("imageUrl")
  })
})
