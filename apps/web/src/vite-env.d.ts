/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IMPORT_API_URL?: string
  readonly VITE_ONLINE_API_URL?: string
  readonly VITE_ONLINE_SOCKET_URL?: string
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
