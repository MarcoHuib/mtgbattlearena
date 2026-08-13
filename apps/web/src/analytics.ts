import { getApps } from "firebase/app"
import type { AppRoute } from "./app/router"
import { firebaseAppName } from "./features/online/firebaseAuth"
import { runtimeConfig } from "./runtimeConfig"

export type AnalyticsConsent = "pending" | "granted" | "denied"

export const analyticsConsentStorageKey = "mtg-analytics-consent-v1"
export const analyticsConsentChangedEvent = "mtg-analytics-consent-changed"

let analyticsPromise:
  Promise<Awaited<ReturnType<typeof loadAnalytics>>> | undefined

export const readAnalyticsConsent = (): AnalyticsConsent => {
  const stored = window.localStorage.getItem(analyticsConsentStorageKey)
  return stored === "granted" || stored === "denied" ? stored : "pending"
}

const loadAnalytics = async () => {
  if (!runtimeConfig.firebaseMeasurementId) return null
  const app = getApps().find(candidate => candidate.name === firebaseAppName)
  if (!app) return null

  const analyticsSdk = await import("firebase/analytics")
  if (!(await analyticsSdk.isSupported())) return null

  analyticsSdk.setConsent({
    analytics_storage:
      readAnalyticsConsent() === "granted" ? "granted" : "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  })
  const analytics = analyticsSdk.initializeAnalytics(app, {
    config: { send_page_view: false },
  })
  analyticsSdk.setDefaultEventParameters({
    app_environment: runtimeConfig.appEnv,
    release_version: runtimeConfig.releaseVersion,
  })
  analyticsSdk.setAnalyticsCollectionEnabled(
    analytics,
    readAnalyticsConsent() === "granted",
  )
  return { analytics, analyticsSdk }
}

const getAnalytics = () => {
  analyticsPromise ??= loadAnalytics().catch(() => null)
  return analyticsPromise
}

export const setAnalyticsConsent = async (
  consent: Exclude<AnalyticsConsent, "pending">,
) => {
  window.localStorage.setItem(analyticsConsentStorageKey, consent)
  window.dispatchEvent(new Event(analyticsConsentChangedEvent))

  if (consent === "denied" && !analyticsPromise) return
  const loaded = await getAnalytics()
  if (!loaded) return

  const granted = consent === "granted"
  loaded.analyticsSdk.setConsent({
    analytics_storage: granted ? "granted" : "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  })
  loaded.analyticsSdk.setAnalyticsCollectionEnabled(loaded.analytics, granted)
}

export const trackAnalyticsPageView = async (route: AppRoute) => {
  if (readAnalyticsConsent() !== "granted") return
  const loaded = await getAnalytics()
  if (!loaded) return

  loaded.analyticsSdk.logEvent(loaded.analytics, "page_view", {
    page_location: window.location.href,
    page_path: route,
    page_title: document.title,
  })
}
