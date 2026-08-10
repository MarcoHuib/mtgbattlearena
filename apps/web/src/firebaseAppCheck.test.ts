import { beforeEach, vi } from "vitest"

const appCheckMocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  initializeAppCheck: vi.fn(() => ({ app: "check" })),
  provider: vi.fn(),
}))

vi.mock("firebase/app-check", () => ({
  getToken: appCheckMocks.getToken,
  initializeAppCheck: appCheckMocks.initializeAppCheck,
  ReCaptchaEnterpriseProvider: appCheckMocks.provider,
}))

vi.mock("./features/online/firebaseAuth", () => ({
  getOrInitializeFirebaseApp: vi.fn(() => ({ name: "app" })),
}))

import {
  addAppCheckHeader,
  configureAppCheckDebugProvider,
  createFirebaseAppCheckTokenProvider,
  setAppCheckTokenProvider,
} from "./firebaseAppCheck"

beforeEach(() => {
  vi.clearAllMocks()
})

test("gebruikt Enterprise, auto-refresh en cached token lookup", async () => {
  appCheckMocks.getToken.mockResolvedValue({ token: "app-check-token" })
  const provider = createFirebaseAppCheckTokenProvider(
    { appId: "app" },
    "enterprise-site-key",
    false,
  )

  await expect(provider.getToken()).resolves.toBe("app-check-token")
  expect(appCheckMocks.provider).toHaveBeenCalledWith("enterprise-site-key")
  expect(appCheckMocks.initializeAppCheck).toHaveBeenCalledWith(
    { name: "app" },
    expect.objectContaining({ isTokenAutoRefreshEnabled: true }),
  )
  expect(appCheckMocks.getToken).toHaveBeenCalledWith({ app: "check" }, false)
})

test("activeert debug uitsluitend voor lokale development", () => {
  const productionGlobal = {} as typeof globalThis & {
    FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean
  }
  configureAppCheckDebugProvider(false, productionGlobal)
  expect(productionGlobal.FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined()

  const developmentGlobal = {} as typeof productionGlobal
  configureAppCheckDebugProvider(true, developmentGlobal)
  expect(developmentGlobal.FIREBASE_APPCHECK_DEBUG_TOKEN).toBe(true)
})

test("voegt de officiële header centraal toe en geeft tokenfouten door", async () => {
  setAppCheckTokenProvider({
    getToken: () => Promise.resolve("header-token"),
  })
  const headers = await addAppCheckHeader(new Headers())
  expect(headers.get("X-Firebase-AppCheck")).toBe("header-token")

  setAppCheckTokenProvider({
    getToken: () => Promise.reject(new Error("veilige fout")),
  })
  await expect(addAppCheckHeader(new Headers())).rejects.toThrow("veilige fout")
})
