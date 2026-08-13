import type {
  CloudDeckContent,
  CloudDeckMetadata,
  ImportedDeck,
} from "@mtg/game-core/types"

export type FirestoreCredentials = {
  client_email: string
  private_key: string
}

export type DeckLibraryRecord = {
  metadata: CloudDeckMetadata
  content: CloudDeckContent
}

const base64url = (value: Uint8Array | string) => {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")
}

export const cloudDeckKey = (provider: string, externalDeckKey: string) =>
  `${provider}_${base64url(externalDeckKey)}`

const importPrivateKey = async (pem: string) => {
  const der = Uint8Array.from(
    atob(pem.replace(/-----[^-]+-----|\s/g, "")),
    character => character.charCodeAt(0),
  )
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  )
}

const accessToken = async (credentials: FirestoreCredentials) => {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claims = base64url(
    JSON.stringify({
      iss: credentials.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  )
  const unsigned = `${header}.${claims}`
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await importPrivateKey(credentials.private_key),
    new TextEncoder().encode(unsigned),
  )
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64url(new Uint8Array(signature))}`,
    }),
  })
  if (!response.ok) throw new Error("FIRESTORE_AUTH_FAILED")
  const body = (await response.json()) as { access_token?: string }
  if (!body.access_token) throw new Error("FIRESTORE_AUTH_FAILED")
  return body.access_token
}

const stringValue = (value: string) => ({ stringValue: value })
const optionalString = (value?: string) =>
  value === undefined ? undefined : stringValue(value)

const documentFields = (record: DeckLibraryRecord) => ({
  metadata: {
    provider: stringValue(record.metadata.provider),
    externalDeckKey: stringValue(record.metadata.externalDeckKey),
    sourceUrl: stringValue(record.metadata.sourceUrl),
    name: stringValue(record.metadata.name),
    format: optionalString(record.metadata.format),
    commanderSummary: optionalString(record.metadata.commanderSummary),
    cardCount: { integerValue: String(record.metadata.cardCount) },
    createdAt: { timestampValue: record.metadata.createdAt },
    updatedAt: { timestampValue: record.metadata.updatedAt },
  },
  content: {
    deckKey: stringValue(record.content.deckKey),
    snapshot: stringValue(JSON.stringify(record.content)),
    importedAt: { timestampValue: record.content.importedAt },
  },
})

export const recordFromImportedDeck = (
  deck: ImportedDeck,
  createdAt = deck.importedAt,
): DeckLibraryRecord => {
  if (deck.source === "local") throw new Error("UNSUPPORTED_DECK_PROVIDER")
  const deckKey = cloudDeckKey(deck.source, deck.sourceId)
  const commanderNames = deck.cards
    .filter(card => card.isCommander)
    .map(
      card =>
        deck.definitions.find(definition => definition.id === card.definitionId)
          ?.name,
    )
    .filter((name): name is string => Boolean(name))
  return {
    metadata: {
      deckKey,
      provider: deck.source,
      externalDeckKey: deck.sourceId,
      sourceUrl: deck.sourceUrl,
      name: deck.name,
      ...(deck.format ? { format: deck.format } : {}),
      ...(commanderNames.length
        ? { commanderSummary: commanderNames.join(" & ") }
        : {}),
      cardCount: deck.cards.reduce((total, card) => total + card.quantity, 0),
      createdAt,
      updatedAt: deck.importedAt,
    },
    content: {
      deckKey,
      cards: deck.cards,
      definitions: deck.definitions,
      importedAt: deck.importedAt,
    },
  }
}

export class FirestoreDeckLibrary {
  constructor(
    private readonly projectId: string,
    private readonly credentials: FirestoreCredentials,
  ) {}

  private document(uid: string, deckKey: string, content = false) {
    const segments = ["users", uid, "decks", deckKey]
    if (content) segments.push("content", "current")
    return `projects/${this.projectId}/databases/(default)/documents/${segments.map(encodeURIComponent).join("/")}`
  }

  private async commit(writes: unknown[]) {
    const token = await accessToken(this.credentials)
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/databases/(default)/documents:commit`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ writes }),
      },
    )
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { status?: string }
      } | null
      if (body?.error?.status === "ALREADY_EXISTS")
        throw new Error("DECK_ALREADY_IMPORTED")
      throw new Error("FIRESTORE_WRITE_FAILED")
    }
  }

  async create(uid: string, record: DeckLibraryRecord) {
    const fields = documentFields(record)
    await this.commit([
      {
        update: {
          name: this.document(uid, record.metadata.deckKey),
          fields: fields.metadata,
        },
        currentDocument: { exists: false },
      },
      {
        update: {
          name: this.document(uid, record.metadata.deckKey, true),
          fields: fields.content,
        },
        currentDocument: { exists: false },
      },
    ])
  }

  async replace(uid: string, record: DeckLibraryRecord) {
    const fields = documentFields(record)
    await this.commit([
      {
        update: {
          name: this.document(uid, record.metadata.deckKey),
          fields: fields.metadata,
        },
        currentDocument: { exists: true },
      },
      {
        update: {
          name: this.document(uid, record.metadata.deckKey, true),
          fields: fields.content,
        },
      },
    ])
  }

  async delete(uid: string, deckKey: string) {
    await this.commit([
      { delete: this.document(uid, deckKey, true) },
      {
        delete: this.document(uid, deckKey),
        currentDocument: { exists: true },
      },
    ])
  }

  async get(uid: string, deckKey: string): Promise<DeckLibraryRecord | null> {
    const token = await accessToken(this.credentials)
    const [metadataResponse, contentResponse] = await Promise.all(
      [false, true].map(content =>
        fetch(
          `https://firestore.googleapis.com/v1/${this.document(uid, deckKey, content)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        ),
      ),
    )
    if (metadataResponse.status === 404 || contentResponse.status === 404)
      return null
    if (!metadataResponse.ok || !contentResponse.ok)
      throw new Error("FIRESTORE_READ_FAILED")
    const metadataDocument = (await metadataResponse.json()) as {
      fields: Record<
        string,
        { stringValue?: string; integerValue?: string; timestampValue?: string }
      >
    }
    const contentDocument = (await contentResponse.json()) as {
      fields: { snapshot?: { stringValue?: string } }
    }
    const field = metadataDocument.fields
    const snapshot = JSON.parse(
      contentDocument.fields.snapshot?.stringValue ?? "null",
    ) as CloudDeckContent | null
    if (!snapshot) throw new Error("FIRESTORE_READ_FAILED")
    return {
      metadata: {
        deckKey,
        provider: field.provider?.stringValue as "archidekt",
        externalDeckKey: field.externalDeckKey?.stringValue ?? "",
        sourceUrl: field.sourceUrl?.stringValue ?? "",
        name: field.name?.stringValue ?? "",
        ...(field.format?.stringValue
          ? { format: field.format.stringValue }
          : {}),
        ...(field.commanderSummary?.stringValue
          ? { commanderSummary: field.commanderSummary.stringValue }
          : {}),
        cardCount: Number(field.cardCount?.integerValue ?? 0),
        createdAt: field.createdAt?.timestampValue ?? "",
        updatedAt: field.updatedAt?.timestampValue ?? "",
      },
      content: snapshot,
    }
  }
}
