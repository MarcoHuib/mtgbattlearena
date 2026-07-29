import { vi } from "vitest"
import type { PersonalGameSnapshot } from "@mtg/game-protocol"
import { CloudflareWebSocketConnection } from "./realtime"
import type { OnlineConnectionUpdate } from "./types"

const snapshot = (gameId: string, version: number): PersonalGameSnapshot => ({
  type: "PERSONAL_SNAPSHOT",
  mode: "online",
  gameId,
  version,
  role: "spectator",
  isHost: false,
  activePlayerId: "p1",
  turnNumber: version + 1,
  phase: "beginning",
  matchStatus: {
    monarchPlayerId: null,
    initiativePlayerId: null,
    dayNight: "none",
  },
  turnOrder: ["p1", "p2"],
  openingHands: {
    p1: { mulliganCount: 0, kept: true },
    p2: { mulliganCount: 0, kept: true },
  },
  players: {
    p1: {
      id: "p1",
      displayName: "Een",
      life: 40,
      poison: 0,
      trackers: { energy: 0, experience: 0, rad: 0 },
      visibleTrackers: { energy: false, experience: false, rad: false },
      citysBlessing: false,
      disabled: false,
      commanderTax: {},
      commanderDamage: {},
      handCount: 7,
      libraryCount: 92,
      battlefield: [],
      graveyard: [],
      exile: [],
      command: [],
    },
    p2: {
      id: "p2",
      displayName: "Twee",
      life: 40,
      poison: 0,
      trackers: { energy: 0, experience: 0, rad: 0 },
      visibleTrackers: { energy: false, experience: false, rad: false },
      citysBlessing: false,
      disabled: false,
      commanderTax: {},
      commanderDamage: {},
      handCount: 7,
      libraryCount: 92,
      battlefield: [],
      graveyard: [],
      exile: [],
      command: [],
    },
  },
  privateView: null,
})

class TestSocket extends EventTarget {
  readyState = 0
  readonly sent: string[] = []
  closed = false

  send(message: string) {
    this.sent.push(message)
  }

  close() {
    this.closed = true
    this.readyState = 3
    this.dispatchEvent(new CloseEvent("close"))
  }

  open() {
    this.readyState = 1
    this.dispatchEvent(new Event("open"))
  }

  receive(value: unknown) {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(value) }),
    )
  }

  disconnect() {
    this.readyState = 3
    this.dispatchEvent(new CloseEvent("close"))
  }
}

describe("Cloudflare WebSocket-adapter", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test("haalt bij reconnect een nieuw ticket en resynchroniseert volledig", async () => {
    vi.useFakeTimers()
    const sockets: TestSocket[] = []
    const updates: OnlineConnectionUpdate[] = []
    let ticketNumber = 0
    const connection = new CloudflareWebSocketConnection(
      "https://online.example/api/online/socket",
      () => {
        ticketNumber += 1
        return Promise.resolve({
          ticket: `ticket-${ticketNumber}`,
          expiresAt: "2026-07-29T19:00:00.000Z",
        })
      },
      url => {
        expect(url).toContain(`ticket=ticket-${ticketNumber}`)
        const socket = new TestSocket()
        sockets.push(socket)
        return socket as unknown as WebSocket
      },
    )
    connection.subscribe(update => {
      updates.push(update)
    })

    connection.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(ticketNumber).toBe(1)
    sockets[0]?.open()
    sockets[0]?.receive(snapshot("game", 0))
    expect(updates).toContainEqual({
      type: "status",
      status: "connected",
    })

    sockets[0]?.disconnect()
    expect(updates.at(-1)).toEqual({
      type: "status",
      status: "reconnecting",
    })
    await vi.advanceTimersByTimeAsync(250)
    expect(ticketNumber).toBe(2)
    sockets[1]?.open()
    sockets[1]?.receive(snapshot("game", 4))
    expect(
      updates.some(
        update =>
          update.type === "event" &&
          update.event.type === "PERSONAL_SNAPSHOT" &&
          update.event.version === 4,
      ),
    ).toBe(true)
    connection.close()
  })
})
