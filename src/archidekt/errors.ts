export type ImportErrorCode =
  | "INVALID_URL"
  | "NETWORK"
  | "NOT_FOUND"
  | "PRIVATE_DECK"
  | "INVALID_RESPONSE"
  | "TIMEOUT"

export class DeckImportError extends Error {
  constructor(
    public readonly code: ImportErrorCode,
    message: string,
    public readonly details?: string,
  ) {
    super(message)
    this.name = "DeckImportError"
  }
}
