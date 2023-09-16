import { ErrorType } from './messages'

/**
 * Error type that can be used to handle errors or send them to the remote endpoint.
 */
export type DXLinkErrorType = ErrorType

/**
 * Unified error that can be used to handle errors or send them to the remote endpoint.
 * @see {@link DXLinkChannel.error}
 * @see {@link DXLinkWebSocketClient.addErrorListener}
 */
export interface DXLinkError {
  readonly type: DXLinkErrorType
  readonly message: string
}

/**
 * Connection state that can be used to check if connection is established and ready to use.
 * @see {@link DXLinkWebSocketClient.getConnectionState}
 */
export enum DXLinkConnectionState {
  /**
   * Client was created and not connected to remote endpoint.
   */
  NOT_CONNECTED = 'NOT_CONNECTED',
  /**
   * The {@link DXLinkWebSocketClient.connect} method was called to establish connection, but connection is not actually established yet.
   */
  CONNECTING = 'CONNECTING',
  /**
   * The connection to remote endpoint is established.
   */
  CONNECTED = 'CONNECTED',
}

/**
 * Connection details that can be used for debugging or logging.
 */
export interface DXLinkConnectionDetails {
  readonly protocolVersion: string
  readonly clientVersion: string
  readonly serverVersion?: string
  readonly clientKeepaliveTimeout?: number
  readonly serverKeepaliveTimeout?: number
}

/**
 * Listener for connection state changes.
 */
export type DXLinkConnectionStateChangeListener = (
  state: DXLinkConnectionState,
  prev: DXLinkConnectionState
) => void

/**
 * Authentication state that can be used to check if user is authorized on the remote endpoint.
 */
export enum DXLinkAuthState {
  /**
   * User is unauthorized on the remote endpoint.
   */
  UNAUTHORIZED = 'UNAUTHORIZED',
  /**
   * User in the process of authorization, but not yet authorized.
   */
  AUTHORIZING = 'AUTHORIZING',
  /**
   * User is authorized on the remote endpoint and can use it.
   */
  AUTHORIZED = 'AUTHORIZED',
}

/**
 * Listener for authentication state changes.
 */
export type DXLinkAuthStateChangeListener = (state: DXLinkAuthState, prev: DXLinkAuthState) => void

/**
 * Message that can be sent to or received from the channel.
 * @see {@link DXLinkChannel.send} and {@link DXLinkChannel.addMessageListener}
 */
export interface DXLinkChannelMessage {
  readonly type: string
  readonly [key: string]: unknown
}

/**
 * Listener for messages from the channel.
 * @see {@link DXLinkChannel.addMessageListener}
 */
export type DXLinkChannelMessageListener = (message: DXLinkChannelMessage) => void

/**
 * Listener for channel status changes.
 * @see {@link DXLinkChannel.addStatusListener}
 */
export type DXLinkChannelStatusListener = (
  status: DXLinkChannelStatus,
  prev: DXLinkChannelStatus
) => void

export type DXLinkErrorListener = (error: DXLinkError) => void

/**
 * Channel status that can be used to check if channel is available for sending messages.
 * @see {@link DXLinkChannel.getStatus}
 */
export enum DXLinkChannelStatus {
  /**
   * Channel is opened and can be used to {@link DXLinkChannel.send} messages.
   */
  OPENED = 'OPENED',
  /**
   * Channel is opening and cannot be used to {@link DXLinkChannel.send} messages.
   */
  REQUESTED = 'REQUESTED',
  /**
   * Channel was closed by {@link DXLinkChannel.close} or by server.
   * Channel cannot be used anymore.
   */
  CLOSED = 'CLOSED',
}

/**
 * Isolated channel to service withing single {@link DXLinkWebSocketClient} connection to remote endpoint.
 * @see {@link DXLinkWebSocketClient.openChannel}
 */
export interface DXLinkChannel {
  readonly id: number
  readonly service: string
  readonly parameters: Record<string, unknown>

  /**
   * Send a message to the channel.
   */
  send(message: DXLinkChannelMessage): void

  /**
   * Add a listener for messages from the channel.
   */
  addMessageListener(listener: DXLinkChannelMessageListener): void
  /**
   * Remove a listener for messages from the channel.
   */
  removeMessageListener(listener: DXLinkChannelMessageListener): void

  getStatus(): DXLinkChannelStatus
  addStatusListener(listener: DXLinkChannelStatusListener): void
  removeStatusListener(listener: DXLinkChannelStatusListener): void

  addErrorListener(listener: DXLinkErrorListener): void
  removeErrorListener(listener: DXLinkErrorListener): void

  /**
   * Send an error to the channel.
   */
  error(error: DXLinkError): void

  close(): void
}

/**
 * dxLink WebSocket client that can be used to connect to the remote endpoint and open channels to services.
 */
export interface DXLinkWebSocketClient {
  /**
   * Connect to the remote endpoint.
   * Connects to the specified remote address. Previously established connections are closed if the new address is different from the old one.
   * This method does nothing if address does not change.
   * The endpoint {@see DXLinkWebSocketClient.getConnectionState} immediately becomes {@link State#CONNECTING CONNECTING}.
   *
   * For connection with the authorization token, use {@link DXLinkWebSocketClient.setAuthToken} before calling this method.
   * If the token is not set, the connection will be established without authorization.
   *
   * @param url WebSocket URL to connect to.
   */
  connect(url: string): Promise<void>
  reconnect(): void
  disconnect(): void

  getConnectionDetails(): DXLinkConnectionDetails

  getConnectionState(): DXLinkConnectionState
  addConnectionStateChangeListener(listener: DXLinkConnectionStateChangeListener): void
  removeConnectionStateChangeListener(listener: DXLinkConnectionStateChangeListener): void

  setAuthToken(token: string): void
  getAuthState(): DXLinkAuthState
  addAuthStateChangeListener(listener: DXLinkAuthStateChangeListener): void
  removeAuthStateChangeListener(listener: DXLinkAuthStateChangeListener): void

  addErrorListener(listener: DXLinkErrorListener): void
  removeErrorListener(listener: DXLinkErrorListener): void

  openChannel(service: string, parameters: Record<string, unknown>): DXLinkChannel
}
