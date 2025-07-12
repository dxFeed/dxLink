import { type Message } from './messages'

type CloseListener = (reason: string, error: boolean) => void

/**
 * Connector for the WebSocket connection.
 * @internal
 */
export class WebSocketConnector {
  private socket: WebSocket | undefined = undefined

  private isAvailable = false

  private openListener: (() => void) | undefined = undefined
  private closeListener: CloseListener | undefined = undefined
  private messageListener: ((message: Message) => void) | undefined = undefined

  constructor(private readonly url: string, private readonly protocols?: string | string[]) {}

  start() {
    if (this.socket !== undefined) return

    this.socket = new WebSocket(this.url, this.protocols)

    this.socket.addEventListener('open', this.handleOpen)
    this.socket.addEventListener('error', this.handleError)
    this.socket.addEventListener('close', this.handleClosed)
  }

  stop() {
    if (this.socket === undefined) return

    this.socket.removeEventListener('open', this.handleOpen)
    this.socket.removeEventListener('error', this.handleError)
    this.socket.removeEventListener('close', this.handleClosed)
    this.socket.removeEventListener('message', this.handleMessage)

    this.socket.close()
    this.socket = undefined
    this.isAvailable = false
  }

  sendMessage = (message: Message) => {
    if (this.socket === undefined || !this.isAvailable) {
      return
    }

    this.socket.send(JSON.stringify(message))
  }

  setOpenListener = (listener: () => void) => {
    this.openListener = listener
  }

  setCloseListener = (listener: CloseListener) => {
    this.closeListener = listener
  }

  setMessageListener = (listener: (message: Message) => void) => {
    this.messageListener = listener
  }

  getUrl = () => this.url

  private handleOpen = () => {
    if (this.socket === undefined) return

    this.isAvailable = true

    this.socket.removeEventListener('open', this.handleOpen)

    this.socket.addEventListener('message', this.handleMessage)
    this.socket.addEventListener('close', this.handleClosed)

    this.openListener?.()
  }

  private handleClosed = (ev: CloseEvent) => {
    if (this.socket === undefined) return

    this.stop()

    this.closeListener?.(ev.reason, false)
  }

  private handleError = (_ev: Event) => {
    if (this.socket === undefined) return

    this.stop()

    this.closeListener?.('Unable to connect', true)
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

      if (this.messageListener === undefined) {
        return console.warn('No message listener set')
      }

      this.messageListener(message)
    } catch (error) {
      console.error(error instanceof Error ? error : new Error('Parsing error:' + String(error)))
    }
  }
}
