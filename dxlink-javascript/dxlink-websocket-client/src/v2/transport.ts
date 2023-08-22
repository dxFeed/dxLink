import { TransportHandler } from './handler'
import { Message } from './messages'

export interface TransportConnection {
  registerHandler(handler: TransportHandler): void

  send(message: Message): void

  close(): void
}

export interface Transport {
  connect(): Promise<TransportConnection>
}

class WebSocketConnection implements TransportConnection {
  private handler: TransportHandler | undefined
  private done: boolean = false

  constructor(private readonly ws: WebSocket) {
    ws.addEventListener('close', this.handleClosed)
    ws.addEventListener('error', this.handleError)
    ws.addEventListener('message', this.handleMessage)
  }

  registerHandler(handler: TransportHandler): void {
    this.handler = handler
  }

  send(message: Message): void {
    if (this.done) {
      throw new Error('Connection closed')
    }

    this.ws.send(JSON.stringify(message))
  }

  close(): void {
    if (this.done) {
      throw new Error('Connection already closed')
    }

    this.ws.removeEventListener('close', this.handleClosed)
    this.ws.removeEventListener('error', this.handleError)
    this.ws.removeEventListener('message', this.handleMessage)

    this.done = true

    this.ws.close()

    this.handler?.handleClose()
  }

  private handleClosed = (ev: CloseEvent) => {
    this.close()

    this.handler?.handleError(
      new Error(ev.reason || 'Transport error: Socket closed unexpectedly.')
    )
  }

  private handleError = (ev: Event) => {
    this.handler?.handleError(
      ev instanceof ErrorEvent ? ev.error : new Error('Transport error: ' + String(ev))
    )
  }

  private handleMessage = (ev: MessageEvent) => {
    try {
      const message = JSON.parse(ev.data)
      if (typeof message !== 'object') {
        throw new Error('Unexpected message: ' + typeof message)
      }
      if (typeof message.type !== 'string') {
        throw new Error('Unexpected message type: ' + typeof message.type)
      }
      if (typeof message.channel !== 'number') {
        throw new Error('Unexpected message channel: ' + typeof message.channel)
      }

      this.handler?.handleMessage(message)
    } catch (error) {
      this.handler?.handleError(
        error instanceof Error ? error : new Error('Parsing error:' + String(error))
      )
    }
  }
}

export class WebSocketTransport implements Transport {
  constructor(private readonly url: string) {}

  connect = () =>
    new Promise<TransportConnection>((resolve, reject) => {
      const ws = new WebSocket(this.url)

      const openListener = () => {
        ws.removeEventListener('open', openListener)
        ws.removeEventListener('error', errorListener)

        const connection = new WebSocketConnection(ws)

        resolve(connection)
      }

      const errorListener = (ev: Event) => {
        ws.removeEventListener('open', openListener)
        ws.removeEventListener('error', errorListener)

        reject(ev instanceof ErrorEvent ? ev.error : new Error(String(ev)))
      }

      ws.addEventListener('open', openListener)
      ws.addEventListener('error', errorListener)
    })
}
