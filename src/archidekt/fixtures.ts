export const archidektFixture = {
  id: 12345,
  name: "Verdant Resolve",
  cards: [
    {
      quantity: 1,
      categories: [{ name: "Commander" }],
      card: {
        uid: "commander-1",
        name: "Aesi, Tyrant of Gyre Strait",
        imageUri: "https://cards.test/aesi.jpg",
        oracleCard: {
          oracleId: "oracle-commander-1",
          typeLine: "Legendary Creature — Serpent",
          text: "You may play an additional land on each of your turns.",
        },
      },
    },
    ...Array.from({ length: 12 }, (_, index) => ({
      quantity: 1,
      categories: [{ name: "Mainboard" }],
      card: {
        uid: `card-${index + 1}`,
        name: `Forest Memory ${index + 1}`,
        imageUri: `https://cards.test/card-${index + 1}.jpg`,
        oracleCard: {
          oracleId: `oracle-${index + 1}`,
          typeLine: index % 2 === 0 ? "Land" : "Creature",
          text: "A reliable fixture card.",
        },
      },
    })),
  ],
}
