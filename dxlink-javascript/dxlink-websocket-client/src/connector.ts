import { type DXLinkWebSocketMessage } from './messages'

/**
 * Interface for a WebSocket connector that manages the connection to a WebSocket server.
 * It provides methods to start and stop the connection, send messages, and set listeners for open, close, and message events.
 */
export interface DXLinkWebSocketConnector {
  /**
   * Returns the URL of the WebSocket connection.
   */
  getUrl(): string
  /**
   * Starts the WebSocket connection.
   */
  start(): void
  /**
   * Stops the WebSocket connection and cleans up resources.
   */
  stop(): void
  /**
   * Sends a message over the WebSocket connection.
   * @param message The message to send.
   */
  sendMessage(message: DXLinkWebSocketMessage): void
  /**
   * Sets a listener that is called when the WebSocket connection is opened.
   * @param listener The listener function to call when the connection is opened.
   */
  setOpenListener(listener: () => void): void
  /**
   * Sets a listener that is called when the WebSocket connection is closed.
   * @param listener The listener function to call when the connection is closed.
   */
  setCloseListener(listener: DXLinkWebSocketCloseListener): void
  /**
   * Sets a listener that is called when a message is received from the WebSocket server.
   * @param listener The listener function to call when a message is received.
   */
  setMessageListener(listener: (message: DXLinkWebSocketMessage) => void): void
}

/**
 * Type for a close listener that is called when the WebSocket connection is closed.
 * @param reason - The reason for the closure.
 * @param error - Indicates if the closure was due to an error.
 */
export type DXLinkWebSocketCloseListener = (reason: string, error: boolean) => void

/**
 * Default connector for the WebSocket connection.
 * @internal
 */
export class DefaultDXLinkWebSocketConnector implements DXLinkWebSocketConnector {
  private socket: WebSocket | undefined = undefined

  private isAvailable = false

  private openListener: (() => void) | undefined = undefined
  private closeListener: DXLinkWebSocketCloseListener | undefined = undefined
  private messageListener: ((message: DXLinkWebSocketMessage) => void) | undefined = undefined

  constructor(
    private readonly url: string,
    private readonly protocols?: string | string[]
  ) {}

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

  sendMessage = (message: DXLinkWebSocketMessage) => {
    if (this.socket === undefined || !this.isAvailable) {
      return
    }

    this.socket.send(JSON.stringify(message))
  }

  setOpenListener = (listener: () => void) => {
    this.openListener = listener
  }

  setCloseListener = (listener: DXLinkWebSocketCloseListener) => {
    this.closeListener = listener
  }

  setMessageListener = (listener: (message: DXLinkWebSocketMessage) => void) => {
    this.messageListener = listener
  }

  getUrl = () => this.url

  private handleOpen = () => {
    if (this.socket === undefined) return

    this.isAvailable = true

    this.socket.removeEventListener('open', this.handleOpen)

    this.socket.addEventListener('message', this.handleMessage)

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
