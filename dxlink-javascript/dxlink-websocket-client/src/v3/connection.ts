import { Message } from './messages'

export interface TransportProcessor {
  processMessage(message: Message): void
  processError(error: Error): void
  processClose(code?: number, reason?: string): void
}

export class WebSocketTransportConnection {
  private done: boolean = false

  constructor(private readonly ws: WebSocket, private readonly processor: TransportProcessor) {
    ws.addEventListener('close', this.handleClosed)
    ws.addEventListener('error', this.handleError)
    ws.addEventListener('message', this.handleMessage)
  }

  send(message: Message): void {
    if (this.done) {
      throw new Error('Connection closed')
    }

    this.ws.send(JSON.stringify(message))
  }

  close(): void {
    if (this.done) {
      return
    }

    this.ws.removeEventListener('close', this.handleClosed)
    this.ws.removeEventListener('error', this.handleError)
    this.ws.removeEventListener('message', this.handleMessage)

    this.done = true

    this.ws.close()
  }

  private handleClosed = (ev: CloseEvent) => {
    this.close()

    this.processor.processError(
      new Error(ev.reason || 'Transport error: Socket closed unexpectedly.')
    )
  }

  private handleError = (ev: Event) => {
    this.processor.processError(
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

      // TODO: validate message properly (e.g. check for type and other fields)

      this.processor.processMessage(message)
    } catch (error) {
      this.processor.processError(
        error instanceof Error ? error : new Error('Parsing error:' + String(error))
      )
    }
  }
}

export class WebSocketTransport {
  static connect = async (url: string, processor: TransportProcessor) => {
    const ws = new WebSocket(url)

    await awaitWebSocketConnect(ws)

    return new WebSocketTransportConnection(ws, processor)
  }
}

export const awaitWebSocketConnect = async (webSocket: WebSocket) =>
  await new Promise<WebSocket>((resolve, reject) => {
    const openListener = () => {
      webSocket.removeEventListener('open', openListener)
      webSocket.removeEventListener('error', errorListener)
      webSocket.removeEventListener('close', closeListener)

      resolve(webSocket)
    }

    const errorListener = (ev: Event) => {
      webSocket.removeEventListener('open', openListener)
      webSocket.removeEventListener('error', errorListener)
      webSocket.removeEventListener('close', closeListener)

      reject(ev instanceof ErrorEvent ? ev.error : new Error(String(ev)))
    }

    const closeListener = () => {
      webSocket.removeEventListener('open', openListener)
      webSocket.removeEventListener('error', errorListener)
      webSocket.removeEventListener('close', closeListener)

      reject(new Error('Connection closed unexpectedly'))
    }

    webSocket.addEventListener('open', openListener)
    webSocket.addEventListener('error', errorListener)
    webSocket.addEventListener('close', closeListener)
  })
