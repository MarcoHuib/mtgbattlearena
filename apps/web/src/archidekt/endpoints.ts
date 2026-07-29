const configuredImportApiUrl = import.meta.env.VITE_IMPORT_API_URL?.trim()

const importApiOrigin = configuredImportApiUrl
  ? configuredImportApiUrl.replace(/\/+$/, "")
  : ""

export const archidektImportUrl = (path: string): string => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${importApiOrigin}/api/import/archidekt${normalizedPath}`
}
