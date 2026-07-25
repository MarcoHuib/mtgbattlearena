import { commanderDefinitions, deckCardCount } from "../game-core/decks"
import { normalizeArchidektDeck } from "./adapter"
import { archidektFixture } from "./fixtures"

describe("normalizeArchidektDeck", () => {
  it("ondersteunt de huidige Archidekt-vorm met naam en types in oracleCard", () => {
    const deck = normalizeArchidektDeck(
      {
        id: 24_617_377,
        name: "Aveline de Grandpré",
        cards: [
          {
            quantity: 1,
            categories: ["Commander"],
            card: {
              id: 113_336,
              uid: "6dccdaba-7504-4df6-a079-d7fe450934ab",
              displayName: null,
              scryfallImageHash: "1783919017",
              oracleCard: {
                id: 3414,
                uid: "104095ed-55e3-408e-bf70-4fe06bb16d2f",
                name: "Crypt Rats",
                layout: "normal",
                faces: [],
                text: "This creature deals damage.",
                superTypes: [],
                types: ["Creature"],
                subTypes: ["Rat"],
              },
            },
          },
        ],
      },
      "24617377",
      "2026-07-24T15:28:10.000Z",
    )

    expect(deck.definitions[0]).toMatchObject({
      name: "Crypt Rats",
      scryfallId: "6dccdaba-7504-4df6-a079-d7fe450934ab",
      oracleId: "104095ed-55e3-408e-bf70-4fe06bb16d2f",
      typeLine: "Creature — Rat",
    })
    expect(deck.definitions[0]?.imageRefs[0]?.url).toBe(
      "https://cards.scryfall.io/normal/front/6/d/6dccdaba-7504-4df6-a079-d7fe450934ab.jpg",
    )
    expect(deck.cards[0]?.isCommander).toBe(true)
  })

  it("normaliseert externe data en markeert de commander", () => {
    const deck = normalizeArchidektDeck(
      archidektFixture,
      "12345",
      "2026-01-01T00:00:00.000Z",
    )

    expect(deck.name).toBe("Verdant Resolve")
    expect(deckCardCount(deck)).toBe(13)
    expect(commanderDefinitions(deck).map(card => card.name)).toEqual([
      "Aesi, Tyrant of Gyre Strait",
    ])
    expect(deck.definitions[0]?.imageRefs[0]?.assetKey).toBe(
      "commander-1:0:normal",
    )
  })

  it("neemt beide zijden van een dubbelzijdige kaart mee", () => {
    const fixture = structuredClone(archidektFixture) as unknown as {
      cards: {
        card: Record<string, unknown>
      }[]
    } & typeof archidektFixture
    fixture.cards[1]!.card.card_faces = [
      {
        name: "Front",
        image_uris: { normal: "https://cards.test/front.jpg" },
      },
      {
        name: "Back",
        image_uris: { normal: "https://cards.test/back.jpg" },
      },
    ]
    const deck = normalizeArchidektDeck(fixture, "12345")
    expect(deck.definitions[1]?.imageRefs).toHaveLength(2)
  })
})
