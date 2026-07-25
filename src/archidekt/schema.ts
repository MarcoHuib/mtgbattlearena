import { z } from "zod"

const identifierSchema = z.union([z.string(), z.number()])

const categorySchema = z.union([
  z.string(),
  z.object({ name: z.string() }).loose(),
])

const cardFaceSchema = z
  .object({
    name: z.string().nullish(),
    displayName: z.string().nullish(),
    type_line: z.string().optional(),
    typeLine: z.string().optional(),
    types: z.array(z.string()).optional(),
    subTypes: z.array(z.string()).optional(),
    superTypes: z.array(z.string()).optional(),
    oracle_text: z.string().optional(),
    oracleText: z.string().optional(),
    text: z.string().optional(),
    image_uris: z
      .object({
        normal: z.url().nullish(),
      })
      .loose()
      .optional(),
    imageUri: z.url().nullish(),
  })
  .loose()

const oracleCardSchema = z
  .object({
    id: identifierSchema.optional(),
    oracleId: identifierSchema.optional(),
    uid: identifierSchema.optional(),
    name: z.string().nullish(),
    text: z.string().optional(),
    typeLine: z.string().optional(),
    types: z.array(z.string()).optional(),
    subTypes: z.array(z.string()).optional(),
    superTypes: z.array(z.string()).optional(),
    layout: z.string().optional(),
    cardFaces: z.array(cardFaceSchema).optional(),
    faces: z.array(cardFaceSchema).optional(),
  })
  .loose()

const externalCardSchema = z
  .object({
    id: identifierSchema.optional(),
    uid: identifierSchema.optional(),
    name: z.string().nullish(),
    displayName: z.string().nullish(),
    oracleCard: oracleCardSchema.optional(),
    imageUri: z.url().nullish(),
    image_uris: z.object({ normal: z.url().nullish() }).loose().nullish(),
    card_faces: z.array(cardFaceSchema).optional(),
  })
  .loose()

export const archidektDeckSchema = z
  .object({
    id: identifierSchema.optional(),
    name: z.string().min(1),
    cards: z.array(
      z
        .object({
          quantity: z.number().int().positive(),
          card: externalCardSchema,
          categories: z.array(categorySchema).optional().default([]),
        })
        .loose(),
    ),
  })
  .loose()

export type ArchidektDeckResponse = z.infer<typeof archidektDeckSchema>
