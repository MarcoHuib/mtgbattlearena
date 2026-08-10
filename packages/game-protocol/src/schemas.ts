import { z } from "zod"

export const playerIdSchema = z.string().min(1).max(80)
export const cardInstanceIdSchema = z.string().min(1).max(120)
export const gameIdSchema = z.string().min(1).max(120)

const tokenKindSchema = z.enum([
  "creature",
  "treasure",
  "food",
  "clue",
  "copy",
  "emblem",
  "other",
])

export const onlineTokenDefinitionSchema = z
  .object({
    definitionId: z.string().min(1).max(120),
    name: z.string().min(1).max(300),
    typeLine: z.string().max(500).optional(),
    imageUrl: z.url().optional(),
    scryfallId: z.string().max(120).optional(),
    kind: tokenKindSchema,
    power: z.number().int().min(-1_000).max(1_000).optional(),
    toughness: z.number().int().min(-1_000).max(1_000).optional(),
  })
  .strict()

export const onlineDeckCardSchema = z
  .object({
    definitionId: z.string().min(1).max(120),
    name: z.string().min(1).max(300),
    typeLine: z.string().max(500).optional(),
    imageUrl: z.url().optional(),
    scryfallId: z.string().max(120).optional(),
    faces: z
      .array(
        z
          .object({
            name: z.string().min(1).max(300),
            typeLine: z.string().max(500).optional(),
            oracleText: z.string().max(20_000).optional(),
            imageUrl: z.url().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(10)
      .optional(),
    quantity: z.number().int().min(1).max(100),
    isCommander: z.boolean().default(false),
  })
  .strict()

export const onlineDeckSubmissionSchema = z
  .object({
    deckSnapshotId: z.string().min(1).max(120),
    deckName: z.string().min(1).max(120),
    cards: z.array(onlineDeckCardSchema).min(1).max(250),
    tokens: z.array(onlineTokenDefinitionSchema).max(250).default([]),
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

const optionalTrackerSchema = z.enum(["energy", "experience", "rad"])

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
      type: z.literal("MOVE_CARDS"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z
        .object({
          moves: z
            .array(
              z
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
            )
            .min(1)
            .max(100),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("MOVE_CARD_IN_LIBRARY"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z
        .object({
          instanceId: cardInstanceIdSchema,
          position: z.enum(["top", "bottom"]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("SET_COUNTER"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z
        .object({
          instanceId: cardInstanceIdSchema,
          counter: z.string().trim().min(1).max(80),
          value: z.number().int().min(0).max(100_000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("SWITCH_FACE"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z.object({ instanceId: cardInstanceIdSchema }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("SET_STACK_ORDER"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z
        .object({
          instanceId: cardInstanceIdSchema,
          direction: z.enum(["front", "back"]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("ATTACH_CARD"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z
        .object({
          attachmentId: cardInstanceIdSchema,
          targetId: cardInstanceIdSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("DETACH_CARD"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z.object({ attachmentId: cardInstanceIdSchema }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("DUPLICATE_TOKEN"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z.object({ instanceId: cardInstanceIdSchema }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("CREATE_GROUP"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z
        .object({
          cardIds: z.array(cardInstanceIdSchema).min(2).max(100),
          name: z.string().trim().max(80).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("ADD_TO_GROUP"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z
        .object({
          groupId: z.string().min(1).max(120),
          cardIds: z.array(cardInstanceIdSchema).min(1).max(100),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("REMOVE_FROM_GROUP"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z
        .object({
          groupId: z.string().min(1).max(120),
          cardIds: z.array(cardInstanceIdSchema).min(1).max(100),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("UPDATE_GROUP"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z
        .object({
          groupId: z.string().min(1).max(120),
          name: z.string().max(80).optional(),
          collapsed: z.boolean().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("MOVE_GROUP"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z
        .object({
          groupId: z.string().min(1).max(120),
          position: battlefieldPositionSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("DISSOLVE_GROUP"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z.object({ groupId: z.string().min(1).max(120) }).strict(),
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
      type: z.literal("REVEAL_LIBRARY"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z.object({ amount: z.number().int().min(1).max(250) }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("HIDE_LIBRARY"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("UNTAP_ALL"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("CREATE_TOKEN"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z
        .object({
          token: onlineTokenDefinitionSchema,
          position: battlefieldPositionSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("CHANGE_TRACKER"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z
        .object({
          tracker: optionalTrackerSchema,
          delta: z.number().int().min(-1_000).max(1_000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("SET_TRACKER_VISIBILITY"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z
        .object({ tracker: optionalTrackerSchema, visible: z.boolean() })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("SET_CITYS_BLESSING"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z.object({ active: z.boolean() }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("SET_PLAYER_DISABLED"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z.object({ disabled: z.boolean() }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("CHANGE_COMMANDER_TAX"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z
        .object({
          commanderId: cardInstanceIdSchema,
          delta: z.number().int().min(-100).max(100),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("CHANGE_COMMANDER_DAMAGE"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z
        .object({
          commanderId: cardInstanceIdSchema,
          delta: z.number().int().min(-100).max(100),
        })
        .strict(),
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
      payload: z.union([
        z.object({ instanceId: cardInstanceIdSchema }).strict(),
        z
          .object({
            instanceIds: z.array(cardInstanceIdSchema).min(1).max(100),
          })
          .strict(),
      ]),
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
      type: z.literal("ROLL_FOR_FIRST_PLAYER"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("COMPLETE_FIRST_PLAYER_ROLL"),
      commandId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
      payload: z.object({}).strict(),
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
      payload: z
        .object({
          bottomCardIds: z.array(cardInstanceIdSchema).max(7).default([]),
        })
        .strict(),
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
    faces: z
      .array(
        z
          .object({
            name: z.string().min(1).max(300),
            typeLine: z.string().max(500).optional(),
            imageUrl: z.url().optional(),
          })
          .strict(),
      )
      .min(1)
      .optional(),
    attachedTo: cardInstanceIdSchema.optional(),
    position: battlefieldPositionSchema.optional(),
    isCommander: z.boolean(),
  })
  .strict()

const publicCardGroupSchema = z
  .object({
    id: z.string().min(1).max(120),
    playerId: playerIdSchema,
    name: z.string().max(80).optional(),
    cardIds: z.array(cardInstanceIdSchema).min(1).max(100),
    position: battlefieldPositionSchema,
    collapsed: z.boolean(),
  })
  .strict()

const publicPlayerSchema = z
  .object({
    id: playerIdSchema,
    displayName: z.string().min(1).max(80),
    life: z.number().int(),
    poison: z.number().int().nonnegative(),
    trackers: z.record(optionalTrackerSchema, z.number().int().nonnegative()),
    visibleTrackers: z.record(optionalTrackerSchema, z.boolean()),
    citysBlessing: z.boolean(),
    disabled: z.boolean(),
    commanderTax: z.record(
      cardInstanceIdSchema,
      z.number().int().nonnegative(),
    ),
    commanderDamage: z.record(
      cardInstanceIdSchema,
      z.number().int().nonnegative(),
    ),
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
    deckSnapshotId: z.string().min(1).max(120),
    hand: z.array(visibleCardSchema),
    revealedLibraryCards: z.array(visibleCardSchema),
    availableTokens: z.array(onlineTokenDefinitionSchema),
  })
  .strict()

const openingHandStateSchema = z
  .object({
    mulliganCount: z.number().int().nonnegative(),
    kept: z.boolean(),
  })
  .strict()

export const firstPlayerRollSchema = z
  .object({
    status: z.enum(["rolling", "tie", "winner_determined", "completed"]),
    round: z.number().int().positive(),
    participantIds: z.array(playerIdSchema).min(2).max(6),
    eligiblePlayerIds: z.array(playerIdSchema).max(6),
    rolls: z.record(playerIdSchema, z.number().int().min(1).max(20)),
    eliminatedPlayerIds: z.array(playerIdSchema).max(6),
    tiedPlayerIds: z.array(playerIdSchema).max(6),
    winnerPlayerId: playerIdSchema.nullable(),
    startPlayerId: playerIdSchema.nullable(),
    rollSequence: z.number().int().nonnegative(),
  })
  .strict()

export const personalGameSnapshotSchema = z
  .object({
    type: z.literal("PERSONAL_SNAPSHOT"),
    mode: z.literal("online"),
    gameId: gameIdSchema,
    version: z.number().int().nonnegative(),
    role: z.enum(["player", "spectator"]),
    isHost: z.boolean(),
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
    firstPlayerRoll: firstPlayerRollSchema,
    turnOrder: z.array(playerIdSchema).min(2).max(6),
    openingHands: z.record(playerIdSchema, openingHandStateSchema),
    players: z.record(playerIdSchema, publicPlayerSchema),
    groupsById: z.record(z.string(), publicCardGroupSchema).optional(),
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
    for (const playerId of snapshot.firstPlayerRoll.participantIds) {
      if (!snapshot.turnOrder.includes(playerId)) {
        context.addIssue({
          code: "custom",
          message: "Een dobbelsteendeelnemer moet aan de game deelnemen.",
          path: ["firstPlayerRoll", "participantIds"],
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
      "GAME_COMMAND_RATE_LIMITED",
      "GAME_STATE_LIMIT_REACHED",
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
      type: z.literal("GAME_ABORTED"),
      gameId: gameIdSchema,
      message: z.string().min(1).max(500),
    })
    .strict(),
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
export type OnlineTokenDefinition = z.infer<typeof onlineTokenDefinitionSchema>
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
