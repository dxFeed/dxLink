import { ChannelMessage, ErrorType, Message, SetupMessage } from './v2/messages'
import { KeepaliveMessage } from './protocol'

interface DXLinkError {
  type: ErrorType
  message: string
}

interface Connection extends Outbound {
  close(): void
}

interface Outbound {
  send(message: Message): void
}

class KeepaliveHandler {
  private lastReceivedMillis: number = Date.now()
  private lastSentMillis: number = Date.now()
  private timeoutId: any

  constructor(
    private readonly connection: Connection,
    private readonly keepaliveInterval: number,
    private readonly keepaliveTimeout: number
  ) {
    this.timeoutId = setTimeout(() => this.timeoutCheck(), this.keepaliveTimeout * 1000)
  }

  handle(_message: Message): void {
    this.lastReceivedMillis = Date.now()
    if (this.lastReceivedMillis - this.lastSentMillis >= this.keepaliveInterval * 1000) {
      this.connection.send({
        type: 'KEEPALIVE',
        channel: 0,
      })
    }
  }

  private timeoutCheck() {
    const now = Date.now()
    const noKeepaliveDuration = now - this.lastReceivedMillis
    if (noKeepaliveDuration >= this.keepaliveTimeout * 1000) {
      return this.connection.close({
        type: 'TIMEOUT',
        message: 'No keepalive received for ' + noKeepaliveDuration + 'ms',
      })
    }

    const nextTimeout = Math.max(200, this.keepaliveTimeout * 1000 - noKeepaliveDuration)
    this.timeoutId = setTimeout(() => this.timeoutCheck(), nextTimeout)
  }

  close() {
    clearTimeout(this.timeoutId)
  }
}

interface MessageHandler {
  handle(message: Message): void
}

class ConnectionMessageHandler {
  constructor(private readonly keepaliveHandler: KeepaliveHandler) {}

  handle(message: Message): void {}
}

interface DXLinkTransport {
  connect(): Promise<Connection>
}

class WebSocketConnection implements Connection {
  constructor(
    private readonly websocket: WebSocket,
    private readonly messageHandler: MessageHandler
  ) {
    websocket.addEventListener('close', this.handleClosed)
    websocket.addEventListener('error', this.handleError)
    websocket.addEventListener('message', this.handleMessage)
  }

  close(): void {
    this.websocket.removeEventListener('close', this.handleClosed)
    this.websocket.removeEventListener('error', this.handleError)
    this.websocket.removeEventListener('message', this.handleMessage)

    this.websocket.close()
  }

  send(message: Message): void {
    this.websocket.send(JSON.stringify(message))
  }

  private handleClosed = (ev: CloseEvent) => {
    console.log('Connection closed: ' + ev.code + ' ' + ev.reason)
    this.close()
  }

  private handleError = (ev: Event) => {
    this.close()
    if (ev instanceof ErrorEvent) {
      console.error(ev.error)
    } else {
      console.error('Transport error: ' + String(ev))
    }
  }

  private handleMessage = (ev: MessageEvent) => {
    if (typeof ev.data !== 'string') {
      console.error('Unexpected message type: ' + typeof ev.data)
      return
    }

    const message = JSON.parse(ev.data)
    if (typeof message === 'object') {
      if (typeof message.type === 'string' && typeof message.channel === 'number') {
        this.messageHandler.handle(message)
      } else {
        console.error('Message missing type or channel', message)
      }
    } else {
      console.error('Unexpected message type: ' + typeof message)
    }
  }
}

class DXLinkWebSocketTransport implements DXLinkTransport {
  constructor(private readonly url: string) {}

  connect = (handler: MessageHandler) =>
    new Promise<Connection>((resolve, reject) => {
      const ws = new WebSocket(this.url)

      const openListener = () => {
        ws.removeEventListener('open', openListener)
        ws.removeEventListener('error', errorListener)

        resolve(connection)
      }

      const errorListener = (ev: Event) => {
        ws.removeEventListener('open', openListener)
        ws.removeEventListener('error', errorListener)
        if (ev instanceof ErrorEvent) {
          reject(ev.error)
        } else {
          reject(new Error('Transport error: ' + String(ev)))
        }
      }

      ws.addEventListener('open', openListener)
      ws.addEventListener('error', errorListener)
    })
}

class DXLinkConnector {
  async connect(): Promise<DXLink> {
    const setupMessage: SetupMessage = {
      type: 'SETUP',
      channel: 0,
      version: '1.0',
      keepaliveTimeout: 30,
      acceptKeepaliveTimeout: 30,
    }

    const connection = await this.transport.connect()

    return {}
  }
}
