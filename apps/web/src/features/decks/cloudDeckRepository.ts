import type { CloudDeckContent, CloudDeckMetadata } from "@mtg/game-core/types"
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  connectFirestoreEmulator,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore"
import type { FirebaseOptions } from "firebase/app"
import { getOrInitializeFirebaseApp } from "../online/firebaseAuth"

export type CloudDeckRepository = {
  list(uid: string): Promise<CloudDeckMetadata[]>
  getContent(uid: string, deckKey: string): Promise<CloudDeckContent | null>
}

export const createFirestoreCloudDeckRepository = (
  options: FirebaseOptions,
  emulatorHost?: string,
): CloudDeckRepository => {
  const firestore = getFirestore(getOrInitializeFirebaseApp(options))
  if (emulatorHost) {
    const match = /^(127\.0\.0\.1|localhost):(\d{2,5})$/.exec(emulatorHost)
    if (!match?.[1] || !match[2])
      throw new Error("INVALID_FIRESTORE_EMULATOR_HOST")
    connectFirestoreEmulator(firestore, match[1], Number(match[2]))
  }
  return {
    async list(uid) {
      const snapshot = await getDocs(
        query(
          collection(firestore, "users", uid, "decks"),
          orderBy("updatedAt", "desc"),
        ),
      )
      return snapshot.docs.map(document => {
        const data = document.data() as Omit<
          CloudDeckMetadata,
          "deckKey" | "createdAt" | "updatedAt"
        > & {
          createdAt: Timestamp | string
          updatedAt: Timestamp | string
        }
        return {
          ...data,
          deckKey: document.id,
          createdAt:
            data.createdAt instanceof Timestamp
              ? data.createdAt.toDate().toISOString()
              : data.createdAt,
          updatedAt:
            data.updatedAt instanceof Timestamp
              ? data.updatedAt.toDate().toISOString()
              : data.updatedAt,
        }
      })
    },
    async getContent(uid, deckKey) {
      const snapshot = await getDoc(
        doc(firestore, "users", uid, "decks", deckKey, "content", "current"),
      )
      if (!snapshot.exists()) return null
      const data = snapshot.data()
      if (typeof data.snapshot === "string")
        return JSON.parse(data.snapshot) as CloudDeckContent
      return data as CloudDeckContent
    },
  }
}
