import { getApps, initializeApp, type FirebaseOptions } from "firebase/app"
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth"
import type { FirebaseAuthPort } from "./services"

const firebaseEnvironmentKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
] as const

type FirebaseEnvironmentKey = (typeof firebaseEnvironmentKeys)[number]
type FirebaseEnvironment = Partial<
  Record<FirebaseEnvironmentKey, string | undefined>
>

const firebaseAuthMessages: Record<string, string> = {
  "auth/email-already-in-use":
    "Dit e-mailadres is al gekoppeld aan een account. Probeer in te loggen.",
  "auth/invalid-credential":
    "De combinatie van e-mailadres en wachtwoord klopt niet.",
  "auth/invalid-email": "Vul een geldig e-mailadres in.",
  "auth/network-request-failed":
    "Firebase kon niet worden bereikt. Controleer je verbinding en probeer opnieuw.",
  "auth/operation-not-allowed":
    "Deze inlogmethode staat nog niet aan in Firebase Authentication.",
  "auth/popup-blocked":
    "De SSO-login werd door de browser geblokkeerd. Sta pop-ups toe en probeer opnieuw.",
  "auth/popup-closed-by-user":
    "De SSO-login is gesloten voordat deze was afgerond.",
  "auth/too-many-requests":
    "Er zijn te veel inlogpogingen gedaan. Wacht even en probeer opnieuw.",
  "auth/unauthorized-domain":
    "Dit domein is nog niet toegestaan in Firebase Authentication.",
  "auth/weak-password": "Kies een wachtwoord van minimaal zes tekens.",
}

export const describeFirebaseAuthError = (error: unknown) => {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String(error.code)
    const knownMessage = firebaseAuthMessages[code]
    if (knownMessage) return knownMessage
  }

  if (
    error instanceof TypeError ||
    (error instanceof Error &&
      /load failed|failed to fetch|networkerror/i.test(error.message))
  ) {
    return "Firebase kon niet worden bereikt. Controleer je verbinding en probeer opnieuw."
  }

  return error instanceof Error && error.message
    ? error.message
    : "Inloggen is mislukt. Probeer het opnieuw."
}

export type FirebaseConfigResult =
  | { configured: true; options: FirebaseOptions }
  | { configured: false; missing: FirebaseEnvironmentKey[] }

export const readFirebaseConfig = (
  environment: FirebaseEnvironment,
): FirebaseConfigResult => {
  const values = Object.fromEntries(
    firebaseEnvironmentKeys.map(key => [key, environment[key]?.trim() ?? ""]),
  ) as Record<FirebaseEnvironmentKey, string>
  const missing = firebaseEnvironmentKeys.filter(key => !values[key])

  if (missing.length > 0) {
    return { configured: false, missing }
  }

  return {
    configured: true,
    options: {
      apiKey: values.VITE_FIREBASE_API_KEY,
      authDomain: values.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: values.VITE_FIREBASE_PROJECT_ID,
      appId: values.VITE_FIREBASE_APP_ID,
    },
  }
}

const firebaseAppName = "mtg-battle-mode-online"

export const createFirebaseAuthPort = (
  options: FirebaseOptions,
): FirebaseAuthPort => {
  const existingApp = getApps().find(app => app.name === firebaseAppName)
  const app = existingApp ?? initializeApp(options, firebaseAppName)
  const auth = getAuth(app)
  const googleProvider = new GoogleAuthProvider()
  googleProvider.setCustomParameters({ prompt: "select_account" })
  const microsoftProvider = new OAuthProvider("microsoft.com")
  microsoftProvider.setCustomParameters({ prompt: "select_account" })

  return {
    get currentUser() {
      return auth.currentUser
    },
    onAuthStateChanged(listener) {
      return onAuthStateChanged(auth, listener)
    },
    async signInWithEmail(email, password) {
      await signInWithEmailAndPassword(auth, email, password)
    },
    async registerWithEmail(email, password) {
      await createUserWithEmailAndPassword(auth, email, password)
    },
    async signInWithGoogle() {
      await signInWithPopup(auth, googleProvider)
    },
    async signInWithMicrosoft() {
      await signInWithPopup(auth, microsoftProvider)
    },
    async signOut() {
      await signOut(auth)
    },
  }
}
