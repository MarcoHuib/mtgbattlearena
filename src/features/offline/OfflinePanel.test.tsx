import { screen } from "@testing-library/react"
import type { OfflineBattlePackage } from "../../game-core/types"
import { renderWithProviders } from "../../utils/test-utils"
import { OfflinePanel } from "./OfflinePanel"

test("toont duurzame foutstatus en een retrypad voor offline assets", () => {
  const record: OfflineBattlePackage = {
    id: "offline-game",
    schemaVersion: 1,
    version: 1,
    title: "Deck one vs. Deck two",
    deckSnapshotIds: ["deck-one", "deck-two"],
    currentGameId: "game-one",
    assetIds: ["card:0:normal"],
    assets: {
      "card:0:normal": {
        assetKey: "card:0:normal",
        url: "https://cards.test/card.jpg",
        status: "failed",
        error: "Netwerk niet bereikbaar.",
      },
    },
    status: "failed",
    totalAssets: 1,
    completedAssets: 0,
    failedAssets: 1,
    downloadedBytes: 0,
    persistentStorage: "denied",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }

  renderWithProviders(<OfflinePanel />, {
    preloadedState: {
      offline: { current: record, panelOpen: true },
    },
  })

  expect(screen.getByText("Download onvolledig")).toBeInTheDocument()
  expect(screen.getByText(/Netwerk niet bereikbaar/)).toBeInTheDocument()
  expect(
    screen.getByRole("button", {
      name: "Mislukte assets opnieuw proberen",
    }),
  ).toBeInTheDocument()
  expect(
    screen.getByText(/geen gegarandeerde persistente opslag/),
  ).toBeInTheDocument()
})
