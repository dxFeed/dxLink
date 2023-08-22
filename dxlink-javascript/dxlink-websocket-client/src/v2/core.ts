import { AuthState, ChannelPayloadMessage, ErrorType } from './messages'

export interface DXLinkError {
  type: ErrorType
  message: string
}

export type DXLinkChannelMessage = Omit<ChannelPayloadMessage, 'channel'>

export interface DXLinkChannelMessageHandler {
  (message: DXLinkChannelMessage): void
}

export type ChannelState = 'OPENED' | 'CLOSED'

export interface DXLinkChannelLifecycleHandler {
  handleState(state: ChannelState): void

  handleError(error: DXLinkError): void
}

export interface DXLinkChannel {
  /**
   * The channel ID.
   */
  readonly id: number
  /**
   * The service name.
   */
  readonly service: string
  /**
   * The channel parameters.
   */
  readonly parameters: Record<string, unknown>

  /**
   * Add a message handler to the channel.
   */
  addMessageHandler(handler: DXLinkChannelMessageHandler): void
  /**
   * Remove a message handler from the channel.
   */
  removeMessageHandler(handler: DXLinkChannelMessageHandler): void

  /**
   * Add a lifecycle handler to the channel.
   */
  addLifecycleHandler(handler: DXLinkChannelLifecycleHandler): void
  /**
   * Remove a lifecycle handler from the channel.
   */
  removeLifecycleHandler(handler: DXLinkChannelLifecycleHandler): void

  /**
   * Check if the channel is available.
   */
  available(): boolean

  /**
   * Send a message to the channel.
   * @param message The message to send.
   */
  send(message: DXLinkChannelMessage): void
  /**
   * Send an error to the channel.
   * @param error The error to send.
   */
  error(error: DXLinkError): void
  /**
   * Close the channel.
   */
  close(): void
}

export interface ClientConnector {
  connect(): Promise<DXLinkWebSocketConnection>
}

export interface ConnectionLifecycleHandler {
  handleClose?(): void

  handleError?(error: DXLinkError): void

  handleAuthState?(state: AuthState): void
}

export interface DXLinkWebSocketConnection {
  readonly clientVersion: string
  readonly serverVersion: string

  /**
   * Add an connection lifecycle handler.
   * @param handler
   */
  addLifecycleHandler(handler: ConnectionLifecycleHandler): void
  /**
   * Remove an connection lifecycle handler.
   * @param handler
   */
  removeLifecycleHandler(handler: ConnectionLifecycleHandler): void

  /**
   * Authenticate the connection.
   * @param token The authentication token.
   */
  auth(token: string): Promise<void>

  /**
   * Get the current authentication state.
   */
  getAuthState(): AuthState

  /**
   * Open a two-way channel to the dxLink service.
   * @param service The service name.
   * @param parameters The serivce parameters.
   * @param channelHandlerFactory A factory function that creates a channel handler.
   * @returns A promise that resolves to the channel.
   */
  openChannel(service: string, parameters?: Record<string, unknown>): Promise<DXLinkChannel>
}
