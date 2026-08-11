import { depthLimit } from "@graphile/depth-limit"
import { useValidationRule } from "@envelop/core"
import { createYoga } from "graphql-yoga"
import type { GraphQLContext } from "./context"
import { schema } from "./schema"
import { operationLimitsRule } from "./security"
import { maskGraphQLError } from "./errors"

export const createGraphQLYoga = (context: GraphQLContext) =>
  createYoga({
    schema,
    graphqlEndpoint: "/graphql",
    landingPage: false,
    cors: false,
    batching: false,
    maskedErrors: {
      errorMessage: "De online service kon de request niet verwerken.",
      maskError: maskGraphQLError,
    },
    context: () => context,
    plugins: [
      // Envelop plugin factories are not React hooks.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useValidationRule(depthLimit({ maxDepth: 8 })),
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useValidationRule(operationLimitsRule),
    ],
  })
