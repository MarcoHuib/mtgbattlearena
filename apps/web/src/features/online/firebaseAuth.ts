import { getApps, initializeApp, type FirebaseOptions } from "firebase/app"
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
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
    async signOut() {
      await signOut(auth)
    },
  }
}
