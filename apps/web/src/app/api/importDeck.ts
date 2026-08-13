import type { ImportedDeck } from "@mtg/game-core/types"
import type { AppDispatch } from "../store"
import type { GraphQLRequestError } from "./graphqlBaseQuery"
import { remoteGraphqlApi } from "./remoteGraphqlApi"
import { normalizeCardImages } from "@mtg/game-core/images"

export type ImportedDeckWithId = ImportedDeck & {
  id: string
  revisionId: string
}

export const importDeckFromUrl = async (
  dispatch: AppDispatch,
  url: string,
): Promise<ImportedDeckWithId> => {
  const result = await dispatch(
    remoteGraphqlApi.endpoints.DeckFromUrl.initiate(
      { url },
      { subscribe: false, forceRefetch: true },
    ),
  ).unwrap()
  const deck = result.deckFromUrl.deck as unknown as ImportedDeck
  return {
    ...deck,
    definitions: deck.definitions.map(normalizeCardImages),
    id: result.deckFromUrl.deckId,
    revisionId: result.deckFromUrl.revisionId,
  }
}

export const importedDeckErrorMessage = (error: unknown): string =>
  typeof error === "object" && error !== null && "data" in error
    ? ((error as GraphQLRequestError).data.message ??
      "Het deck kon niet worden geïmporteerd.")
    : "Het deck kon niet worden geïmporteerd."
