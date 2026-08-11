import { parseServerEvent, type GameCommand } from "@mtg/game-protocol"
import type { OnlineConnectionUpdate, OnlineGameConnection } from "./types"

type TicketFactory = () => Promise<{ ticket: string }>
type SocketFactory = (url: string) => WebSocket

export class CloudflareWebSocketConnection implements OnlineGameConnection {
  private readonly listeners = new Set<
    (update: OnlineConnectionUpdate) => void
  >()
  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0
  private explicitlyClosed = false
  private generation = 0
  private started = false

  constructor(
    private readonly socketEndpoint: string,
    private readonly ticketFactory: TicketFactory,
    private readonly socketFactory: SocketFactory = url => new WebSocket(url),
  ) {}

  private start() {
    if (this.started) return
    this.started = true
    this.explicitlyClosed = false
    this.emit({ type: "status", status: "connecting" })
    void this.open()
  }

  subscribe(listener: (update: OnlineConnectionUpdate) => void) {
    this.listeners.add(listener)
    this.start()
    return () => {
      this.listeners.delete(listener)
    }
  }

  send(command: GameCommand) {
    if (this.socket?.readyState !== 1) {
      throw new Error("De online verbinding is niet gereed.")
    }
    this.socket.send(JSON.stringify(command))
  }

  reconnect() {
    this.explicitlyClosed = false
    this.generation += 1
    this.clearReconnectTimer()
    const previous = this.socket
    this.socket = null
    previous?.close(1000, "Client reconnect")
    this.emit({ type: "status", status: "reconnecting" })
    void this.open()
  }

  close() {
    this.explicitlyClosed = true
    this.started = false
    this.generation += 1
    this.clearReconnectTimer()
    const previous = this.socket
    this.socket = null
    previous?.close(1000, "Client closed")
    this.emit({ type: "status", status: "disconnected" })
  }

  private async open() {
    const generation = this.generation
    try {
      const { ticket } = await this.ticketFactory()
      if (this.explicitlyClosed || generation !== this.generation) return
      const url = new URL(this.socketEndpoint)
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
      url.searchParams.set("ticket", ticket)
      const socket = this.socketFactory(url.toString())
      if (this.explicitlyClosed || generation !== this.generation) {
        socket.close(1000, "Stale connection")
        return
      }
      this.socket = socket
      socket.addEventListener("open", () => {
        if (socket !== this.socket) return
        this.reconnectAttempt = 0
        this.emit({ type: "status", status: "connected" })
      })
      socket.addEventListener("message", event => {
        if (socket !== this.socket || typeof event.data !== "string") return
        try {
          this.emit({
            type: "event",
            event: parseServerEvent(JSON.parse(event.data)),
          })
        } catch {
          this.emit({
            type: "status",
            status: "error",
            message: "De server stuurde een ongeldig bericht.",
          })
        }
      })
      socket.addEventListener("close", () => {
        if (socket !== this.socket) return
        this.socket = null
        if (this.explicitlyClosed) return
        this.scheduleReconnect()
      })
      socket.addEventListener("error", () => {
        if (socket !== this.socket) return
        this.emit({
          type: "status",
          status: "error",
          message: "De WebSocketverbinding is onderbroken.",
        })
      })
    } catch (error) {
      if (this.explicitlyClosed) return
      this.emit({
        type: "status",
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Een nieuw socket-ticket ophalen is mislukt.",
      })
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    this.clearReconnectTimer()
    this.emit({ type: "status", status: "reconnecting" })
    const delay = Math.min(5_000, 250 * 2 ** this.reconnectAttempt)
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.open()
    }, delay)
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) return
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private emit(update: OnlineConnectionUpdate) {
    for (const listener of this.listeners) listener(update)
  }
}
