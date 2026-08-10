import { afterEach, expect, test, vi } from "vitest"
import { setAppCheckTokenProvider } from "../../firebaseAppCheck"
import { CloudflareOnlineGameService } from "./services"
import type { AuthService } from "./types"

afterEach(() => {
  vi.restoreAllMocks()
  setAppCheckTokenProvider({ getToken: () => Promise.resolve(null) })
})

test("behoudt Authorization naast de centrale App Check-header", async () => {
  setAppCheckTokenProvider({
    getToken: () => Promise.resolve("app-check-token"),
  })
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json([]))
  const auth = {
    getIdToken: () => Promise.resolve("auth-token"),
  } as unknown as AuthService
  const service = new CloudflareOnlineGameService(
    "https://api.example.test",
    auth,
  )

  await service.listPublicLobbies()

  const requestInit = fetchMock.mock.calls[0]?.[1]
  const headers = new Headers(requestInit?.headers)
  expect(headers.get("Authorization")).toBe("Bearer auth-token")
  expect(headers.get("X-Firebase-AppCheck")).toBe("app-check-token")
})
