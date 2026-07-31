// Development always uses Vite's same-origin proxy. This keeps local deck
// imports independent of the production API's CORS allowlist, including when
// Vite selects a fallback port such as 5174.
const configuredImportApiUrl = import.meta.env.DEV
  ? undefined
  : import.meta.env.VITE_IMPORT_API_URL?.trim()

const importApiOrigin = configuredImportApiUrl
  ? configuredImportApiUrl.replace(/\/+$/, "")
  : ""

export const archidektImportUrl = (path: string): string => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${importApiOrigin}/api/import/archidekt${normalizedPath}`
}
