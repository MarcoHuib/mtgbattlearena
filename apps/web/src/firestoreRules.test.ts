import { readFileSync } from "node:fs"
import { resolve } from "node:path"

test("Firestore rules staan alleen ownerreads toe en weigeren browserwrites", () => {
  const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8")
  expect(rules).toContain("request.auth.uid == uid")
  expect(rules).toContain("allow write: if false")
  expect(rules).toContain("request.auth != null")
})
