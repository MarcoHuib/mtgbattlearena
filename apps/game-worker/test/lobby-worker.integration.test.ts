import { LobbyDurableObject } from "../src/lobby-durable-object"
import type {
  AddParticipantResult,
  LobbyDeckRecord,
  LobbyRecord,
  LobbyStore,
  ParticipantRecord,
} from "../src/lobby-storage"
import { MemorySocketTicketRepository } from "../src/tickets"
import type {
  DurableObjectState,
  Env,
  SqlStorageCursor,
  VerifiedIdentity,
} from "../src/types"

class MemoryLobbyStore implements LobbyStore {
  private readonly lobbies = new Map<string, LobbyRecord>()
  private readonly participants = new Map<string, ParticipantRecord>()
  private readonly decks = new Map<string, LobbyDeckRecord>()

  listVisible(viewerUid?: string) {
    return [...this.lobbies.values()]
      .filter(
        lobby =>
          (lobby.visibility === "public" && lobby.status === "waiting") ||
          (viewerUid !== undefined &&
            lobby.status !== "finished" &&
            this.getParticipant(lobby.id, viewerUid) !== null),
      )
      .map(lobby => this.withCount(lobby))
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
    return this.listParticipants(gameId).filter(
      participant => participant.role === "player",
    )
  }

  listParticipants(gameId: string) {
    return [...this.participants.values()]
      .filter(participant => participant.gameId === gameId)
      .sort(
        (left, right) =>
          (left.seatNumber ?? Number.MAX_SAFE_INTEGER) -
          (right.seatNumber ?? Number.MAX_SAFE_INTEGER),
      )
      .map(participant => structuredClone(participant))
  }

  getDeck(gameId: string, uid: string) {
    return (
      structuredClone(this.decks.get(this.participantKey(gameId, uid))) ?? null
    )
  }

  listDecks(gameId: string) {
    return [...this.decks.values()]
      .filter(deck => deck.gameId === gameId)
      .map(deck => structuredClone(deck))
  }

  upsertDeck(record: LobbyDeckRecord) {
    this.decks.set(
      this.participantKey(record.gameId, record.uid),
      structuredClone(record),
    )
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

  deleteLobby(gameId: string) {
    if (!this.lobbies.delete(gameId)) return false
    for (const [key, participant] of this.participants) {
      if (participant.gameId === gameId) this.participants.delete(key)
    }
    for (const [key, deck] of this.decks) {
      if (deck.gameId === gameId) this.decks.delete(key)
    }
    return true
  }

  private withCount(lobby: LobbyRecord): LobbyRecord {
    return {
      ...structuredClone(lobby),
      playerCount: this.listPlayers(lobby.id).length,
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
      expect.objectContaining({
        id: gameId,
        playerCount: 1,
        viewerRole: null,
      }),
    ])
    expect(lobby.listPublicLobbies(host.uid)[0]?.viewerRole).toBe("host")

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
    const room = lobby.getLobbyRoom(gameId, identity("two"))
    expect(room).toMatchObject({
      ok: true,
      value: { lobby: { viewerRole: "player" } },
    })
    if (!room.ok) return
    expect(room.value.participants).toHaveLength(5)
    expect(room.value.participants[0]).toMatchObject({
      displayName: "User host",
      isHost: true,
      isViewer: false,
    })
    expect(room.value.participants[1]).toMatchObject({
      displayName: "User two",
      isHost: false,
      isViewer: true,
    })

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

  test("laat alleen de host een wachtende lobby verwijderen", () => {
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
        title: "Tijdelijke tafel",
        format: "Commander",
        visibility: "public",
        maxPlayers: 4,
      },
      host,
    )
    if (!created.ok) throw new Error("Lobby creation failed.")
    lobby.joinByCode(created.value.code, "player", identity("guest"))

    expect(
      lobby.deleteLobby(created.value.id, identity("guest")),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" })
    expect(lobby.deleteLobby(created.value.id, host)).toEqual({
      ok: true,
      value: null,
    })
    expect(lobby.listPublicLobbies()).toEqual([])
    expect(lobby.getSession(created.value.id, host.uid)).toBeNull()
  })

  test("bindt geregistreerde decks aan serverseats en archiveert de open lobby", () => {
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
    const submission = (uid: string) => ({
      deckSnapshotId: `deck-${uid}`,
      deckName: `Deck van ${uid}`,
      cards: [
        {
          definitionId: `card-${uid}`,
          name: "Testkaart",
          quantity: 10,
          isCommander: false,
        },
      ],
    })
    expect(lobby.prepareRegisteredGame(created.value.id, host)).toMatchObject({
      ok: false,
      code: "LOBBY_NOT_READY",
    })
    for (const player of players) {
      expect(
        lobby.registerDeck(
          created.value.id,
          identity(player.uid),
          submission(player.uid),
        ),
      ).toEqual({ ok: true, value: null })
    }
    const room = lobby.getLobbyRoom(created.value.id, host)
    expect(room).toMatchObject({
      ok: true,
      value: {
        participants: [
          {
            deckReady: true,
            deckName: "Deck van host",
          },
          {
            deckReady: true,
            deckName: "Deck van guest",
          },
        ],
      },
    })

    const prepared = lobby.prepareRegisteredGame(created.value.id, host)
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    expect(prepared.value.seed.players).toEqual([
      expect.objectContaining({
        uid: "host",
        displayName: "User host",
        deckSnapshotId: "deck-host",
        cards: [
          {
            definitionId: "card-host",
            name: "Testkaart",
            quantity: 10,
            isCommander: false,
          },
        ],
      }),
      expect.objectContaining({
        uid: "guest",
        displayName: "User guest",
        deckSnapshotId: "deck-guest",
      }),
    ])
    expect(
      lobby.prepareRegisteredGame(created.value.id, identity("guest")),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" })

    expect(lobby.markGameActive(created.value.id, host)).toEqual({
      ok: true,
      value: null,
    })
    expect(lobby.listPublicLobbies()).toEqual([])
    expect(lobby.listPublicLobbies(host.uid)).toEqual([
      expect.objectContaining({
        id: created.value.id,
        status: "active",
        viewerRole: "host",
      }),
    ])
    expect(lobby.listPublicLobbies("guest")).toEqual([
      expect.objectContaining({
        id: created.value.id,
        status: "active",
        viewerRole: "player",
      }),
    ])
  })
})
