import { Message } from './messages'

export class WebSocketConnector {
  private socket: WebSocket | undefined = undefined

  private isAvailable = false

  private openListener: (() => void) | undefined = undefined
  private closeListener: ((error?: Error) => void) | undefined = undefined
  private messageListener: ((message: Message) => void) | undefined = undefined

  constructor(private readonly url: string) {}

  start() {
    if (this.socket !== undefined) return

    this.socket = new WebSocket(this.url)

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
      throw new Error('Socket is not available')
    }

    this.socket.send(JSON.stringify(message))
  }

  setOpenListener = (listener: () => void) => {
    this.openListener = listener
  }

  setCloseListener = (listener: () => void) => {
    this.closeListener = listener
  }

  setMessageListener = (listener: (message: Message) => void) => {
    this.messageListener = listener
  }

  private handleOpen = () => {
    if (this.socket === undefined) return

    this.isAvailable = true

    this.socket.removeEventListener('open', this.handleOpen)

    this.socket.addEventListener('message', this.handleMessage)
    this.socket.addEventListener('close', this.handleClosed)

    this.openListener?.()
  }

  private handleClosed = (_ev?: CloseEvent) => {
    if (this.socket === undefined) return

    this.stop()

    this.closeListener?.()
  }

  private handleError = (_ev: Event) => {
    // TODO: handle error

    if (this.socket === undefined) return

    this.stop()

    this.closeListener?.()
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
