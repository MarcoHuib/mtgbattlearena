import type { ImportedDeck } from "@mtg/game-core/types"
import type { AppDispatch } from "../store"
import type { GraphQLRequestError } from "./graphqlBaseQuery"
import { remoteGraphqlApi } from "./remoteGraphqlApi"
import { currentArchidektSourceHash } from "../../archidekt/freshness"

export const importDeckFromUrl = async (
  dispatch: AppDispatch,
  url: string,
  sourceHash?: string,
): Promise<ImportedDeck> => {
  const freshnessHash = sourceHash ?? (await currentArchidektSourceHash(url))
  const result = await dispatch(
    remoteGraphqlApi.endpoints.DeckFromUrl.initiate(
      { url, sourceHash: freshnessHash },
      { subscribe: false, forceRefetch: true },
    ),
  ).unwrap()
  return result.deckFromUrl.deck as ImportedDeck
}

export const importedDeckErrorMessage = (error: unknown): string =>
  typeof error === "object" && error !== null && "data" in error
    ? ((error as GraphQLRequestError).data.message ??
      "Het deck kon niet worden geïmporteerd.")
    : "Het deck kon niet worden geïmporteerd."
