import { z } from "zod"

export const playerIdSchema = z.string().min(1).max(80)
export const cardInstanceIdSchema = z.string().min(1).max(120)
export const gameIdSchema = z.string().min(1).max(120)

export const onlineDeckCardSchema = z
  .object({
    definitionId: z.string().min(1).max(120),
    name: z.string().min(1).max(300),
    typeLine: z.string().max(500).optional(),
    imageUrl: z.url().optional(),
    scryfallId: z.string().max(120).optional(),
    quantity: z.number().int().min(1).max(100),
    isCommander: z.boolean().default(false),
  })
  .strict()

export const onlineDeckSubmissionSchema = z
  .object({
    deckSnapshotId: z.string().min(1).max(120),
    deckName: z.string().min(1).max(120),
    cards: z.array(onlineDeckCardSchema).min(1).max(250),
  })
  .strict()
  .superRefine((deck, context) => {
    const definitionIds = deck.cards.map(card => card.definitionId)
    if (new Set(definitionIds).size !== definitionIds.length) {
      context.addIssue({
        code: "custom",
        message: "Kaartdefinities moeten per deck uniek zijn.",
        path: ["cards"],
      })
    }
  })

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
  z
    .object({
      type: z.literal("SET_MONARCH"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z.object({ playerId: playerIdSchema.nullable() }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("SET_INITIATIVE"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z.object({ playerId: playerIdSchema.nullable() }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("SET_DAY_NIGHT"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z.object({ status: z.enum(["none", "day", "night"]) }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("MULLIGAN_HAND"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("KEEP_HAND"),
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

const openingHandStateSchema = z
  .object({
    mulliganCount: z.number().int().nonnegative(),
    kept: z.boolean(),
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
    phase: z.enum([
      "beginning",
      "precombat-main",
      "combat",
      "postcombat-main",
      "ending",
    ]),
    matchStatus: z
      .object({
        monarchPlayerId: playerIdSchema.nullable(),
        initiativePlayerId: playerIdSchema.nullable(),
        dayNight: z.enum(["none", "day", "night"]),
      })
      .strict(),
    turnOrder: z.array(playerIdSchema).min(2).max(6),
    openingHands: z.record(playerIdSchema, openingHandStateSchema),
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
    for (const [field, playerId] of [
      ["monarchPlayerId", snapshot.matchStatus.monarchPlayerId],
      ["initiativePlayerId", snapshot.matchStatus.initiativePlayerId],
    ] as const) {
      if (playerId !== null && !snapshot.turnOrder.includes(playerId)) {
        context.addIssue({
          code: "custom",
          message: "Een statushouder moet aan de game deelnemen.",
          path: ["matchStatus", field],
        })
      }
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
      if (!snapshot.openingHands[playerId]) {
        context.addIssue({
          code: "custom",
          message: "Iedere speler moet een openingshandstatus hebben.",
          path: ["openingHands", playerId],
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
export type OnlineDeckSubmission = z.infer<typeof onlineDeckSubmissionSchema>
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
