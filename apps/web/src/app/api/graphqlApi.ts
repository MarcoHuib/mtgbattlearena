import { createApi } from "@reduxjs/toolkit/query/react"
import { graphqlBaseQuery } from "./graphqlBaseQuery"

export const graphqlApi = createApi({
  reducerPath: "graphqlApi",
  baseQuery: graphqlBaseQuery(),
  tagTypes: ["LobbyList", "Lobby"],
  endpoints: () => ({}),
})
