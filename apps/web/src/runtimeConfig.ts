export type RuntimeConfig = {
  appEnv: string
  releaseVersion: string
  importApiUrl: string
  onlineApiUrl: string
  onlineSocketUrl: string
  firebaseApiKey: string
  firebaseAuthDomain: string
  firebaseProjectId: string
  firebaseAppId: string
}

type RuntimeConfigInput = Partial<Record<keyof RuntimeConfig, unknown>>
type BuildEnvironment = Partial<
  Pick<
    ImportMetaEnv,
    | "VITE_IMPORT_API_URL"
    | "VITE_ONLINE_API_URL"
    | "VITE_ONLINE_SOCKET_URL"
    | "VITE_FIREBASE_API_KEY"
    | "VITE_FIREBASE_AUTH_DOMAIN"
    | "VITE_FIREBASE_PROJECT_ID"
    | "VITE_FIREBASE_APP_ID"
  >
>

type RuntimeConfigWindow = Window & {
  __MTG_RUNTIME_CONFIG__?: RuntimeConfigInput
}

const stringValue = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

export const resolveRuntimeConfig = (
  runtime: RuntimeConfigInput | undefined,
  buildEnvironment: BuildEnvironment,
): RuntimeConfig => ({
  appEnv: stringValue(runtime?.appEnv),
  releaseVersion: stringValue(runtime?.releaseVersion),
  importApiUrl:
    stringValue(runtime?.importApiUrl) ||
    stringValue(buildEnvironment.VITE_IMPORT_API_URL),
  onlineApiUrl:
    stringValue(runtime?.onlineApiUrl) ||
    stringValue(buildEnvironment.VITE_ONLINE_API_URL),
  onlineSocketUrl:
    stringValue(runtime?.onlineSocketUrl) ||
    stringValue(buildEnvironment.VITE_ONLINE_SOCKET_URL),
  firebaseApiKey:
    stringValue(runtime?.firebaseApiKey) ||
    stringValue(buildEnvironment.VITE_FIREBASE_API_KEY),
  firebaseAuthDomain:
    stringValue(runtime?.firebaseAuthDomain) ||
    stringValue(buildEnvironment.VITE_FIREBASE_AUTH_DOMAIN),
  firebaseProjectId:
    stringValue(runtime?.firebaseProjectId) ||
    stringValue(buildEnvironment.VITE_FIREBASE_PROJECT_ID),
  firebaseAppId:
    stringValue(runtime?.firebaseAppId) ||
    stringValue(buildEnvironment.VITE_FIREBASE_APP_ID),
})

const localBuildEnvironment = import.meta.env.DEV
  ? {
      VITE_IMPORT_API_URL: import.meta.env.VITE_IMPORT_API_URL,
      VITE_ONLINE_API_URL: import.meta.env.VITE_ONLINE_API_URL,
      VITE_ONLINE_SOCKET_URL: import.meta.env.VITE_ONLINE_SOCKET_URL,
      VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
      VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
    }
  : {}

export const runtimeConfig = resolveRuntimeConfig(
  typeof window === "undefined"
    ? undefined
    : (window as RuntimeConfigWindow).__MTG_RUNTIME_CONFIG__,
  localBuildEnvironment,
)
