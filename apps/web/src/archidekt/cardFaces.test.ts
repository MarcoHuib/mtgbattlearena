import { describe, expect, it } from "vitest"
import {
  deriveArchidektBackImageUrl,
  hasUsableCardBack,
  resolveCardFaces,
} from "./cardFaces"

const archidektFront =
  "https://card-images.archidekt.com/normal/front/6/3/63ba8eef-b834-4031-b0a1-0f8505d53813.jpg?1783924799"

describe("resolveCardFaces", () => {
  it("bewaart expliciete front- en backmetadata", () => {
    expect(
      resolveCardFaces({
        name: "Edgar, Charmed Groom",
        layout: "transform",
        explicitFaces: [
          {
            name: "Edgar, Charmed Groom",
            imageUri: "https://img.test/front.jpg",
          },
          {
            name: "Edgar Markov's Coffin",
            imageUri: "https://img.test/back.jpg",
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        name: "Edgar, Charmed Groom",
        imageUrl: "https://img.test/front.jpg",
      }),
      expect.objectContaining({
        name: "Edgar Markov's Coffin",
        imageUrl: "https://img.test/back.jpg",
      }),
    ])
  })

  it("leidt alleen voor een flipbaar layout een toegestane Archidekt-back af", () => {
    const faces = resolveCardFaces({
      name: "Edgar, Charmed Groom",
      layout: "transform",
      frontImageUrl: archidektFront,
    })
    expect(faces).toHaveLength(2)
    expect(faces[1]?.imageUrl).toContain("/normal/back/6/3/")
    expect(hasUsableCardBack(faces)).toBe(true)
  })

  it("behandelt een normale kaart en oud snapshot met alleen front als enkelzijdig", () => {
    expect(
      resolveCardFaces({
        name: "Sol Ring",
        layout: "normal",
        frontImageUrl: archidektFront,
      }),
    ).toHaveLength(1)
    expect(resolveCardFaces({ name: "Oude kaart" })).toEqual([
      expect.objectContaining({ name: "Oude kaart", imageUrl: undefined }),
    ])
  })

  it("weigert een onbekende host en een onherkenbaar frontpad", () => {
    expect(
      deriveArchidektBackImageUrl(
        "https://evil.example/normal/front/6/3/card.jpg",
      ),
    ).toBeUndefined()
    expect(
      deriveArchidektBackImageUrl(
        "https://card-images.archidekt.com/art/front/card.jpg",
      ),
    ).toBeUndefined()
  })

  it("valt veilig terug wanneer de achterkantmetadata ontbreekt", () => {
    const faces = resolveCardFaces({
      name: "Meld-deel",
      layout: "meld",
      frontImageUrl: archidektFront,
    })
    expect(faces).toHaveLength(1)
    expect(hasUsableCardBack(faces)).toBe(false)
  })
})
