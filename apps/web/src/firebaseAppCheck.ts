import type { FirebaseOptions } from "firebase/app"
import {
  getToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from "firebase/app-check"
import { getOrInitializeFirebaseApp } from "./features/online/firebaseAuth"

export const firebaseAppCheckHeader = "X-Firebase-AppCheck"

type DebugGlobal = typeof globalThis & {
  FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string
}

export type AppCheckTokenProvider = {
  getToken(): Promise<string | null>
}

let activeProvider: AppCheckTokenProvider = {
  getToken: () => Promise.resolve(null),
}

export const configureAppCheckDebugProvider = (
  development: boolean,
  target: DebugGlobal = globalThis,
) => {
  if (development) target.FIREBASE_APPCHECK_DEBUG_TOKEN = true
}

export const createFirebaseAppCheckTokenProvider = (
  options: FirebaseOptions,
  siteKey: string,
  development: boolean,
): AppCheckTokenProvider => {
  if (!siteKey.trim()) {
    throw new Error("Firebase App Check-configuratie ontbreekt.")
  }
  configureAppCheckDebugProvider(development)
  const appCheck: AppCheck = initializeAppCheck(
    getOrInitializeFirebaseApp(options),
    {
      provider: new ReCaptchaEnterpriseProvider(siteKey.trim()),
      isTokenAutoRefreshEnabled: true,
    },
  )
  return {
    async getToken() {
      try {
        return (await getToken(appCheck, false)).token
      } catch {
        throw new Error(
          "De app-integriteitscontrole kon niet worden voltooid. Probeer het opnieuw.",
        )
      }
    },
  }
}

export const setAppCheckTokenProvider = (provider: AppCheckTokenProvider) => {
  activeProvider = provider
}

export const getAppCheckToken = () => activeProvider.getToken()

export const addAppCheckHeader = async (headers: Headers) => {
  const token = await getAppCheckToken()
  if (token) headers.set(firebaseAppCheckHeader, token)
  return headers
}
