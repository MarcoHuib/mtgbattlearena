import { useEffect, useState } from "react"
import {
  analyticsConsentChangedEvent,
  readAnalyticsConsent,
  setAnalyticsConsent,
  trackAnalyticsPageView,
  type AnalyticsConsent as AnalyticsConsentValue,
} from "../analytics"
import type { AppRoute } from "../app/router"

export const useAnalyticsConsent = () => {
  const [consent, setConsent] =
    useState<AnalyticsConsentValue>(readAnalyticsConsent)

  useEffect(() => {
    const update = () => {
      setConsent(readAnalyticsConsent())
    }
    window.addEventListener(analyticsConsentChangedEvent, update)
    return () => {
      window.removeEventListener(analyticsConsentChangedEvent, update)
    }
  }, [])

  return consent
}

export const AnalyticsConsent = ({ route }: { route: AppRoute }) => {
  const consent = useAnalyticsConsent()

  useEffect(() => {
    if (consent === "granted") void trackAnalyticsPageView(route)
  }, [consent, route])

  if (consent !== "pending") return null

  return (
    <section
      className="analytics-consent"
      role="region"
      aria-labelledby="analytics-consent-title"
    >
      <div>
        <h2 id="analytics-consent-title">
          Mogen we analytische cookies gebruiken?
        </h2>
        <p>
          Help ons MTG Battle Arena te verbeteren. We gebruiken anonieme
          gegevens over het gebruik van de app. Deze gegevens worden niet
          gebruikt voor persoonlijke advertenties.
        </p>
      </div>
      <div className="analytics-consent__actions">
        <button
          className="button button--secondary"
          type="button"
          onClick={() => void setAnalyticsConsent("denied")}
        >
          Niet toestaan
        </button>
        <button
          className="button button--primary"
          type="button"
          onClick={() => void setAnalyticsConsent("granted")}
        >
          Toestaan
        </button>
      </div>
    </section>
  )
}
