import { screen } from "@testing-library/react"
import { beforeEach } from "vitest"
import { analyticsConsentStorageKey, readAnalyticsConsent } from "../analytics"
import { renderWithProviders } from "../utils/test-utils"
import { AnalyticsConsent } from "./AnalyticsConsent"

beforeEach(() => {
  window.localStorage.clear()
})

test("verstuurt niets voordat de bezoeker kiest en bewaart weigering", async () => {
  const { user } = renderWithProviders(<AnalyticsConsent route="/" />)

  expect(
    screen.getByRole("heading", {
      name: "Mogen we analytische cookies gebruiken?",
    }),
  ).toBeInTheDocument()
  expect(readAnalyticsConsent()).toBe("pending")

  await user.click(screen.getByRole("button", { name: "Niet toestaan" }))

  expect(window.localStorage.getItem(analyticsConsentStorageKey)).toBe("denied")
  expect(
    screen.queryByRole("heading", {
      name: "Mogen we analytische cookies gebruiken?",
    }),
  ).not.toBeInTheDocument()
})

test("bewaart expliciete toestemming en sluit de melding", async () => {
  const { user } = renderWithProviders(<AnalyticsConsent route="/online" />)

  await user.click(screen.getByRole("button", { name: "Toestaan" }))

  expect(window.localStorage.getItem(analyticsConsentStorageKey)).toBe(
    "granted",
  )
  expect(
    screen.queryByRole("heading", {
      name: "Mogen we analytische cookies gebruiken?",
    }),
  ).not.toBeInTheDocument()
})
