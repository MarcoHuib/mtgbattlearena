import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore"
import { afterAll, beforeAll, beforeEach, describe, test } from "vitest"

const projectId = "mtg-battle-arena-rules-test"
let environment: RulesTestEnvironment

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080),
      rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8"),
    },
  })
})

beforeEach(async () => {
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async context => {
    const database = context.firestore()
    await setDoc(doc(database, "users/user-a/decks/deck-a"), {
      name: "A",
    })
    await setDoc(doc(database, "users/user-a/decks/deck-a/content/current"), {
      snapshot: "{}",
    })
    await setDoc(doc(database, "users/user-b/decks/deck-b"), {
      name: "B",
    })
    await setDoc(doc(database, "users/user-b/decks/deck-b/content/current"), {
      snapshot: "{}",
    })
  })
})

afterAll(async () => environment.cleanup())

describe("Firestore Deck Library rules", () => {
  test("laat een owner eigen metadata en content lezen", async () => {
    const database = environment.authenticatedContext("user-a").firestore()
    await assertSucceeds(getDoc(doc(database, "users/user-a/decks/deck-a")))
    await assertSucceeds(
      getDoc(doc(database, "users/user-a/decks/deck-a/content/current")),
    )
  })

  test("weigert cross-owner metadata- en contentreads", async () => {
    const database = environment.authenticatedContext("user-a").firestore()
    await assertFails(getDoc(doc(database, "users/user-b/decks/deck-b")))
    await assertFails(
      getDoc(doc(database, "users/user-b/decks/deck-b/content/current")),
    )
  })

  test("weigert reads zonder authenticatie", async () => {
    const database = environment.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(database, "users/user-a/decks/deck-a")))
    await assertFails(
      getDoc(doc(database, "users/user-a/decks/deck-a/content/current")),
    )
  })

  test("weigert browserwrites, ook voor de owner", async () => {
    const database = environment.authenticatedContext("user-a").firestore()
    await assertFails(
      setDoc(doc(database, "users/user-a/decks/new-deck"), { name: "Nieuw" }),
    )
    await assertFails(deleteDoc(doc(database, "users/user-a/decks/deck-a")))
    await assertFails(
      setDoc(doc(database, "users/user-a/decks/deck-a/content/current"), {
        snapshot: "changed",
      }),
    )
  })
})
