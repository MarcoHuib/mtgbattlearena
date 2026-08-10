import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

/** @param {string} name */
const readRequiredEnvironment = name => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const requiredEnvironment = {
  APP_ENV: readRequiredEnvironment("APP_ENV"),
  IMPORT_API_URL: readRequiredEnvironment("IMPORT_API_URL"),
  ONLINE_API_URL: readRequiredEnvironment("ONLINE_API_URL"),
  ONLINE_SOCKET_URL: readRequiredEnvironment("ONLINE_SOCKET_URL"),
  RELEASE_VERSION: readRequiredEnvironment("RELEASE_VERSION"),
  FIREBASE_API_KEY: readRequiredEnvironment("FIREBASE_API_KEY"),
  FIREBASE_AUTH_DOMAIN: readRequiredEnvironment("FIREBASE_AUTH_DOMAIN"),
  FIREBASE_PROJECT_ID: readRequiredEnvironment("FIREBASE_PROJECT_ID"),
  FIREBASE_APP_ID: readRequiredEnvironment("FIREBASE_APP_ID"),
  FIREBASE_MEASUREMENT_ID: readRequiredEnvironment("FIREBASE_MEASUREMENT_ID"),
  RUNTIME_CONFIG_OUTPUT: readRequiredEnvironment("RUNTIME_CONFIG_OUTPUT"),
}

if (!/^[a-z][a-z0-9-]*$/i.test(requiredEnvironment.APP_ENV)) {
  throw new Error("APP_ENV must contain only letters, numbers, and hyphens.")
}

/**
 * @param {string} name
 * @param {string} value
 */
const validateHttpUrl = (name, value) => {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`)
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(`${name} must be an HTTP(S) URL without credentials.`)
  }
}

validateHttpUrl("IMPORT_API_URL", requiredEnvironment.IMPORT_API_URL)
validateHttpUrl("ONLINE_API_URL", requiredEnvironment.ONLINE_API_URL)
validateHttpUrl("ONLINE_SOCKET_URL", requiredEnvironment.ONLINE_SOCKET_URL)

const config = {
  appEnv: requiredEnvironment.APP_ENV,
  releaseVersion: requiredEnvironment.RELEASE_VERSION,
  importApiUrl: requiredEnvironment.IMPORT_API_URL,
  onlineApiUrl: requiredEnvironment.ONLINE_API_URL,
  onlineSocketUrl: requiredEnvironment.ONLINE_SOCKET_URL,
  firebaseApiKey: requiredEnvironment.FIREBASE_API_KEY,
  firebaseAuthDomain: requiredEnvironment.FIREBASE_AUTH_DOMAIN,
  firebaseProjectId: requiredEnvironment.FIREBASE_PROJECT_ID,
  firebaseAppId: requiredEnvironment.FIREBASE_APP_ID,
  firebaseMeasurementId: requiredEnvironment.FIREBASE_MEASUREMENT_ID,
}
const destination = resolve(requiredEnvironment.RUNTIME_CONFIG_OUTPUT)
await mkdir(dirname(destination), { recursive: true })
await writeFile(
  destination,
  `window.__MTG_RUNTIME_CONFIG__ = Object.freeze(${JSON.stringify(config, null, 2)})\n`,
  "utf8",
)
