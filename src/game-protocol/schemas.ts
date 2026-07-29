import { z } from "zod"

export const playerIdSchema = z.string().min(1).max(80)
export const cardInstanceIdSchema = z.string().min(1).max(120)
export const gameIdSchema = z.string().min(1).max(120)

const battlefieldPositionSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    z: z.number().int().nonnegative(),
  })
  .strict()

export const gameCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("DRAW_CARD"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z.object({ amount: z.number().int().min(1).max(20) }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("MOVE_CARD"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z
        .object({
          instanceId: cardInstanceIdSchema,
          zone: z.enum([
            "library",
            "hand",
            "battlefield",
            "graveyard",
            "exile",
            "command",
          ]),
          position: battlefieldPositionSchema.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("CHANGE_POISON"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z
        .object({ delta: z.number().int().min(-1_000).max(1_000) })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("MILL"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z.object({ amount: z.number().int().min(1).max(100) }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("SHUFFLE_LIBRARY"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("PASS_TURN"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("TOGGLE_TAP"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z.object({ instanceId: cardInstanceIdSchema }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("CHANGE_LIFE"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z
        .object({ delta: z.number().int().min(-1_000).max(1_000) })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("NEXT_PHASE"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z.object({}).strict(),
    })
    .strict(),
])

const visibleCardSchema = z
  .object({
    instanceId: cardInstanceIdSchema,
    definitionId: z.string().min(1).max(120),
    name: z.string().min(1).max(300),
    imageUrl: z.url().optional(),
    typeLine: z.string().max(500).optional(),
    tapped: z.boolean(),
    activeFaceIndex: z.number().int().nonnegative(),
    counters: z.record(z.string(), z.number().int()),
    position: battlefieldPositionSchema.optional(),
    isCommander: z.boolean(),
  })
  .strict()

const publicPlayerSchema = z
  .object({
    id: playerIdSchema,
    displayName: z.string().min(1).max(80),
    life: z.number().int(),
    poison: z.number().int().nonnegative(),
    handCount: z.number().int().nonnegative(),
    libraryCount: z.number().int().nonnegative(),
    battlefield: z.array(visibleCardSchema),
    graveyard: z.array(visibleCardSchema),
    exile: z.array(visibleCardSchema),
    command: z.array(visibleCardSchema),
  })
  .strict()

const privatePlayerViewSchema = z
  .object({
    playerId: playerIdSchema,
    hand: z.array(visibleCardSchema),
    revealedLibraryCards: z.array(visibleCardSchema),
  })
  .strict()

export const personalGameSnapshotSchema = z
  .object({
    type: z.literal("PERSONAL_SNAPSHOT"),
    mode: z.literal("online"),
    gameId: gameIdSchema,
    version: z.number().int().nonnegative(),
    role: z.enum(["player", "spectator"]),
    activePlayerId: playerIdSchema,
    turnNumber: z.number().int().positive(),
    turnOrder: z.array(playerIdSchema).min(2).max(6),
    players: z.record(playerIdSchema, publicPlayerSchema),
    privateView: privatePlayerViewSchema.nullable(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (!snapshot.turnOrder.includes(snapshot.activePlayerId)) {
      context.addIssue({
        code: "custom",
        message: "De actieve speler moet in de beurtvolgorde staan.",
        path: ["activePlayerId"],
      })
    }
    if (snapshot.role === "spectator" && snapshot.privateView !== null) {
      context.addIssue({
        code: "custom",
        message: "Een spectator mag geen private view ontvangen.",
        path: ["privateView"],
      })
    }
    if (
      snapshot.role === "player" &&
      (!snapshot.privateView ||
        !snapshot.turnOrder.includes(snapshot.privateView.playerId))
    ) {
      context.addIssue({
        code: "custom",
        message: "Een speler moet precies zijn eigen private view ontvangen.",
        path: ["privateView"],
      })
    }
    for (const playerId of snapshot.turnOrder) {
      if (!snapshot.players[playerId]) {
        context.addIssue({
          code: "custom",
          message:
            "Iedere speler in de beurtvolgorde moet publiek zichtbaar zijn.",
          path: ["players", playerId],
        })
      }
    }
  })

export const protocolErrorSchema = z
  .object({
    code: z.enum([
      "AUTH_REQUIRED",
      "FORBIDDEN",
      "INVALID_COMMAND",
      "VERSION_CONFLICT",
      "GAME_NOT_FOUND",
      "LOBBY_FULL",
      "TICKET_EXPIRED",
      "TICKET_USED",
      "RATE_LIMITED",
      "NOT_READY",
      "INTERNAL_ERROR",
    ]),
    message: z.string().min(1).max(500),
    retryable: z.boolean(),
    currentVersion: z.number().int().nonnegative().optional(),
  })
  .strict()

export const serverEventSchema = z.discriminatedUnion("type", [
  personalGameSnapshotSchema,
  z
    .object({
      type: z.literal("COMMAND_ACCEPTED"),
      gameId: gameIdSchema,
      commandId: z.uuid(),
      version: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal("ERROR"),
      gameId: gameIdSchema.optional(),
      commandId: z.uuid().optional(),
      error: protocolErrorSchema,
      snapshot: personalGameSnapshotSchema.optional(),
    })
    .strict(),
])

export type GameCommand = z.infer<typeof gameCommandSchema>
export type VisibleOnlineCard = z.infer<typeof visibleCardSchema>
export type PublicOnlinePlayer = z.infer<typeof publicPlayerSchema>
export type PersonalGameSnapshot = z.infer<typeof personalGameSnapshotSchema>
export type ProtocolError = z.infer<typeof protocolErrorSchema>
export type ServerEvent = z.infer<typeof serverEventSchema>

export const parseGameCommand = (input: unknown): GameCommand =>
  gameCommandSchema.parse(input)

export const parsePersonalSnapshot = (input: unknown): PersonalGameSnapshot =>
  personalGameSnapshotSchema.parse(input)

export const parseServerEvent = (input: unknown): ServerEvent =>
  serverEventSchema.parse(input)
