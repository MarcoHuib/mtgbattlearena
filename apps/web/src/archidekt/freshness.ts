import {
  archidektTokenIdsForFingerprint,
  fingerprintArchidektSource,
  parseArchidektSourceId,
} from "@mtg/deck-source"
import { addAppCheckHeader } from "../firebaseAppCheck"
import { archidektImportUrl } from "./endpoints"

const fetchSourceJson = async (url: string): Promise<unknown> => {
  const headers = await addAppCheckHeader(
    new Headers({ Accept: "application/json" }),
  )
  const response = await fetch(url, { headers })
  if (!response.ok)
    throw new Error("De actuele deckbron kon niet worden gecontroleerd.")
  return response.json()
}

/** Observes provider data only. ImportedDeck mapping remains backend-only. */
export const currentArchidektSourceHash = async (
  url: string,
): Promise<string> => {
  const sourceId = parseArchidektSourceId(url)
  const deck = await fetchSourceJson(archidektImportUrl(`/${sourceId}?fresh=1`))
  const tokenIds = archidektTokenIdsForFingerprint(deck)
  const tokens = tokenIds.length
    ? await fetchSourceJson(
        archidektImportUrl(
          `/tokens?ids=${encodeURIComponent(tokenIds.join(","))}&fresh=1`,
        ),
      )
    : null
  return fingerprintArchidektSource(deck, tokens)
}
