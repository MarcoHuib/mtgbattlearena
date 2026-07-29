import { LobbyDurableObject } from "../worker/online/lobby-durable-object"
import type {
  AddParticipantResult,
  LobbyRecord,
  LobbyStore,
  ParticipantRecord,
} from "../worker/online/lobby-storage"
import { MemorySocketTicketRepository } from "../worker/online/tickets"
import type {
  DurableObjectState,
  Env,
  SqlStorageCursor,
  VerifiedIdentity,
} from "../worker/online/types"

class MemoryLobbyStore implements LobbyStore {
  private readonly lobbies = new Map<string, LobbyRecord>()
  private readonly participants = new Map<string, ParticipantRecord>()

  listPublic() {
    return [...this.lobbies.values()]
      .filter(
        lobby => lobby.visibility === "public" && lobby.status === "waiting",
      )
      .map(lobby => this.summary(this.withCount(lobby)))
  }

  getByCode(code: string) {
    const lobby = [...this.lobbies.values()].find(
      candidate => candidate.code === code,
    )
    return lobby ? this.withCount(lobby) : null
  }

  getById(gameId: string) {
    const lobby = this.lobbies.get(gameId)
    return lobby ? this.withCount(lobby) : null
  }

  insertLobbyWithHost(lobby: LobbyRecord, participant: ParticipantRecord) {
    this.lobbies.set(lobby.id, structuredClone(lobby))
    this.participants.set(
      this.participantKey(participant.gameId, participant.uid),
      structuredClone(participant),
    )
  }

  getParticipant(gameId: string, uid: string) {
    return (
      structuredClone(
        this.participants.get(this.participantKey(gameId, uid)),
      ) ?? null
    )
  }

  listPlayers(gameId: string) {
    return [...this.participants.values()]
      .filter(
        participant =>
          participant.gameId === gameId && participant.role === "player",
      )
      .sort((left, right) => (left.seatNumber ?? 0) - (right.seatNumber ?? 0))
      .map(participant => structuredClone(participant))
  }

  addParticipant(
    gameId: string,
    participant: ParticipantRecord,
  ): AddParticipantResult {
    const lobby = this.getById(gameId)
    if (!lobby) return { status: "missing" }
    const existing = this.getParticipant(gameId, participant.uid)
    if (existing) return { status: "existing", participant: existing }
    if (
      participant.role === "player" &&
      lobby.playerCount >= lobby.maxPlayers
    ) {
      return { status: "full" }
    }
    this.participants.set(
      this.participantKey(gameId, participant.uid),
      structuredClone(participant),
    )
    return { status: "inserted", participant }
  }

  setStatus(gameId: string, status: LobbyRecord["status"], updatedAt: string) {
    const lobby = this.lobbies.get(gameId)
    if (!lobby) return false
    this.lobbies.set(gameId, { ...lobby, status, updatedAt })
    return true
  }

  private withCount(lobby: LobbyRecord): LobbyRecord {
    return {
      ...structuredClone(lobby),
      playerCount: this.listPlayers(lobby.id).length,
    }
  }

  private summary(lobby: LobbyRecord) {
    return {
      id: lobby.id,
      code: lobby.code,
      title: lobby.title,
      hostDisplayName: lobby.hostDisplayName,
      format: lobby.format,
      visibility: lobby.visibility,
      status: lobby.status,
      playerCount: lobby.playerCount,
      maxPlayers: lobby.maxPlayers,
      createdAt: lobby.createdAt,
    }
  }

  private participantKey(gameId: string, uid: string) {
    return `${gameId}:${uid}`
  }
}

const identity = (uid: string): VerifiedIdentity => ({
  uid,
  name: `User ${uid}`,
  anonymous: true,
})

const state: DurableObjectState = {
  storage: {
    sql: {
      exec: <T extends object = Record<string, unknown>>() =>
        ({
          toArray: () => [],
          one: () => {
            throw new Error("No SQL rows expected with injected stores.")
          },
        }) as SqlStorageCursor<T>,
    },
    transactionSync: callback => callback(),
  },
  blockConcurrencyWhile: callback => callback(),
  acceptWebSocket: () => undefined,
  getWebSockets: () => [],
}

describe("Lobby Durable Object RPC", () => {
  test("beheert vier seats, spectator, host en tickets zonder externe database", async () => {
    const store = new MemoryLobbyStore()
    const tickets = new MemorySocketTicketRepository()
    const lobby = new LobbyDurableObject(state, {} as Env, store, tickets)
    const host = identity("host")
    const created = lobby.createLobby(
      {
        title: "Commanderavond",
        format: "Commander",
        visibility: "public",
        maxPlayers: 4,
      },
      host,
    )
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const gameId = created.value.id
    const code = created.value.code
    expect(lobby.listPublicLobbies()).toEqual([
      expect.objectContaining({ id: gameId, playerCount: 1 }),
    ])

    for (const uid of ["two", "three", "four"]) {
      const joined = lobby.joinByCode(code, "player", identity(uid))
      expect(joined).toMatchObject({
        ok: true,
        value: { gameId, role: "player" },
      })
    }
    const spectator = lobby.joinByCode(code, "spectator", identity("viewer"))
    expect(spectator).toMatchObject({
      ok: true,
      value: { role: "spectator", lobby: { playerCount: 4 } },
    })
    expect(
      lobby.joinByCode(code, "player", identity("too-many")),
    ).toMatchObject({ ok: false, code: "LOBBY_FULL" })

    const hostSession = lobby.getSession(gameId, host.uid)
    const viewerSession = lobby.getSession(gameId, "viewer")
    expect(hostSession).toMatchObject({
      role: "player",
      isHost: true,
    })
    expect(typeof hostSession?.playerId).toBe("string")
    expect(viewerSession).toEqual({
      gameId,
      uid: "viewer",
      playerId: null,
      role: "spectator",
      isHost: false,
    })

    const issued = await lobby.issueSocketTicket(gameId, identity("two"))
    expect(issued.ok).toBe(true)
    if (!issued.ok) return
    const consumed = await lobby.consumeSocketTicket(issued.value.ticket)
    expect(consumed).toMatchObject({
      gameId,
      uid: "two",
      role: "player",
      isHost: false,
    })
    expect(await lobby.consumeSocketTicket(issued.value.ticket)).toBeNull()
  })

  test("bindt initialisatie aan exact de serverseats en archiveert de open lobby", () => {
    const store = new MemoryLobbyStore()
    const lobby = new LobbyDurableObject(
      state,
      {} as Env,
      store,
      new MemorySocketTicketRepository(),
    )
    const host = identity("host")
    const created = lobby.createLobby(
      {
        title: "Duel",
        format: "Commander",
        visibility: "public",
        maxPlayers: 2,
      },
      host,
    )
    if (!created.ok) throw new Error("Lobby creation failed.")
    lobby.joinByCode(created.value.code, "player", identity("guest"))
    const players = store.listPlayers(created.value.id)
    const submission = {
      gameId: created.value.id,
      title: "Duel",
      players: players.map(player => ({
        playerId: player.playerId ?? "",
        displayName: "Client value wordt niet vertrouwd",
        deckSnapshotId: `deck-${player.uid}`,
        cards: [
          {
            definitionId: `card-${player.uid}`,
            name: "Testkaart",
            quantity: 10,
            isCommander: false,
          },
        ],
      })),
    }
    const prepared = lobby.prepareGame(created.value.id, host, submission)
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    expect(prepared.value.seed.players.map(player => player.uid)).toEqual([
      "host",
      "guest",
    ])
    expect(
      lobby.prepareGame(created.value.id, identity("guest"), submission),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" })
    expect(
      lobby.prepareGame(created.value.id, host, {
        ...submission,
        players: submission.players.slice(0, 1),
      }),
    ).toMatchObject({ ok: false, code: "INVALID_REQUEST" })

    expect(lobby.markGameActive(created.value.id, host)).toEqual({
      ok: true,
      value: null,
    })
    expect(lobby.listPublicLobbies()).toEqual([])
  })
})
