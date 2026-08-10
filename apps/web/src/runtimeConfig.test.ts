import { resolveRuntimeConfig } from "./runtimeConfig"

const emptyBuildEnvironment = {}

test("runtimeconfiguratie overschrijft build-time fallbacks", () => {
  const config = resolveRuntimeConfig(
    {
      appEnv: "beta-candidate",
      releaseVersion: "42",
      importApiUrl: "https://api.beta.example.test",
      onlineApiUrl: "https://api.beta.example.test",
      onlineSocketUrl: "https://ws.beta.example.test",
      firebaseProjectId: "shared-project",
    },
    {
      VITE_IMPORT_API_URL: "https://api.production.example.test",
      VITE_ONLINE_API_URL: "https://api.production.example.test",
      VITE_ONLINE_SOCKET_URL: "https://ws.production.example.test",
    } as ImportMetaEnv,
  )

  expect(config).toMatchObject({
    appEnv: "beta-candidate",
    releaseVersion: "42",
    importApiUrl: "https://api.beta.example.test",
    onlineApiUrl: "https://api.beta.example.test",
    onlineSocketUrl: "https://ws.beta.example.test",
    firebaseProjectId: "shared-project",
  })
})

test("ontbrekende configuratie blijft leeg voor local-first gebruik", () => {
  expect(resolveRuntimeConfig(undefined, emptyBuildEnvironment)).toEqual({
    appEnv: "",
    releaseVersion: "",
    importApiUrl: "",
    onlineApiUrl: "",
    onlineSocketUrl: "",
    firebaseApiKey: "",
    firebaseAuthDomain: "",
    firebaseProjectId: "",
    firebaseAppId: "",
    firebaseMeasurementId: "",
    firebaseAppCheckRecaptchaEnterpriseSiteKey: "",
  })
})
