import type { CloudDeckContent, CloudDeckMetadata } from "@mtg/game-core/types"
import { getCardImageUrl, publicImageRef } from "@mtg/game-core/images"
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

export const cloudDeckThumbnailUrl = (deck: CloudDeckMetadata) => {
  try {
    return deck.thumbnailImageRef
      ? getCardImageUrl(deck.thumbnailImageRef)
      : null
  } catch {
    return null
  }
}

const parsedJson = (value: unknown): unknown => {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

const manaColors = new Set(["W", "U", "B", "R", "G"] as const)

export const normalizeCloudDeckMetadata = (
  deckKey: string,
  data: Record<string, unknown>,
): CloudDeckMetadata => {
  const thumbnailValue = parsedJson(data.thumbnailImageRef)
  const thumbnailImageRef =
    thumbnailValue && typeof thumbnailValue === "object"
      ? publicImageRef(thumbnailValue)
      : undefined
  const colorValue = parsedJson(data.colorIdentity)
  const colorIdentity = Array.isArray(colorValue)
    ? colorValue.filter(
        (color): color is "W" | "U" | "B" | "R" | "G" =>
          typeof color === "string" &&
          manaColors.has(color as "W" | "U" | "B" | "R" | "G"),
      )
    : []
  const timestamp = (value: unknown) =>
    value instanceof Timestamp
      ? value.toDate().toISOString()
      : typeof value === "string"
        ? value
        : ""
  return {
    deckKey,
    provider: data.provider === "archidekt" ? "archidekt" : "archidekt",
    externalDeckKey:
      typeof data.externalDeckKey === "string" ? data.externalDeckKey : "",
    sourceUrl: typeof data.sourceUrl === "string" ? data.sourceUrl : "",
    name: typeof data.name === "string" ? data.name : "Onbekend deck",
    ...(typeof data.format === "string" ? { format: data.format } : {}),
    ...(typeof data.commanderSummary === "string"
      ? { commanderSummary: data.commanderSummary }
      : {}),
    ...(thumbnailImageRef ? { thumbnailImageRef } : {}),
    ...(colorIdentity.length ? { colorIdentity } : {}),
    cardCount: typeof data.cardCount === "number" ? data.cardCount : 0,
    createdAt: timestamp(data.createdAt),
    updatedAt: timestamp(data.updatedAt),
  }
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
      return snapshot.docs.map(document =>
        normalizeCloudDeckMetadata(document.id, document.data()),
      )
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
