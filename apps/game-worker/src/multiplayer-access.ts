import type { VerifiedIdentity } from "./types"

/**
 * Centrale toegangscontrole voor het AANMAKEN van lobbies tijdens de bètafase.
 * Joinen, spelen, lobbies bekijken en deelname beëindigen vallen hier bewust
 * buiten en gebruiken de bestaande autorisatie (ingelogd, lidmaatschap, rol).
 *
 * Production en Staging draaien dezelfde Worker-code en delen dezelfde
 * Firebase Identity Provider; deze module is daarom de enige bron van waarheid
 * en bevat bewust geen omgevingsverschillen. Offline gameplay en de Deck
 * Library gebruiken deze module niet.
 *
 * Beheer:
 * - Host toevoegen: voeg zijn Firebase UID toe aan LOBBY_CREATOR_UIDS.
 * - Publieke release: zet LOBBY_CREATION_MODE op "public".
 * Beide wijzigingen worden pas actief na een deploy van de game-worker.
 */
export type LobbyCreationMode = "beta" | "public"

export const LOBBY_CREATION_MODE = "beta" as LobbyCreationMode

// Firebase-UID's zijn geen geheimen; autorisatie gebeurt uitsluitend op de
// server-side geverifieerde `uid`, nooit op e-mailadres of client-input.
export const LOBBY_CREATOR_UIDS: readonly string[] = [
  "6xBlqTtsTje2nOmSWD6tbz83Wiu1",
]

export const LOBBY_CREATION_RESTRICTED_CODE = "LOBBY_CREATION_RESTRICTED"
export const LOBBY_CREATION_RESTRICTED_MESSAGE =
  "Lobby’s aanmaken is tijdens de bèta nog niet beschikbaar voor jouw account. Je kunt wel deelnemen aan bestaande lobby’s."

type AccessEnv = { APP_ENV?: string; LOBBY_CREATION_MODE?: string }

// De override bestaat uitsluitend voor lokale ontwikkeling en tests; in een
// deployed omgeving (APP_ENV production/staging) wordt hij genegeerd.
const overrideAllowed = (appEnv?: string) =>
  !appEnv || ["development", "test", "local"].includes(appEnv)

export const resolveLobbyCreationMode = (env: AccessEnv): LobbyCreationMode => {
  if (overrideAllowed(env.APP_ENV) && env.LOBBY_CREATION_MODE === "public") {
    return "public"
  }
  return LOBBY_CREATION_MODE === "public" ? "public" : "beta"
}

/** Fail-closed: zonder geverifieerde identiteit is multiplayer geblokkeerd. */
export const canCreateLobby = (
  identity: Pick<VerifiedIdentity, "uid"> | null | undefined,
  env: AccessEnv,
): boolean => {
  if (!identity?.uid) return false
  if (resolveLobbyCreationMode(env) === "public") return true
  return LOBBY_CREATOR_UIDS.includes(identity.uid)
}

export class LobbyCreationRestrictedError extends Error {
  constructor() {
    super(LOBBY_CREATION_RESTRICTED_CODE)
  }
}

export const assertCanCreateLobby = (
  identity: Pick<VerifiedIdentity, "uid"> | null | undefined,
  env: AccessEnv,
): void => {
  if (!canCreateLobby(identity, env)) throw new LobbyCreationRestrictedError()
}
