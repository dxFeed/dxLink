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
   * @see {@link DXLinkWebSocketClient.connect}
   */
  NOT_CONNECTED = 'NOT_CONNECTED',
  /**
   * The {@link DXLinkWebSocketClient.connect} method was called to establish connection or {@link DXLinkWebSocketClient.reconnect} is in progress.
   * The connection is not ready to use yet.
   */
  CONNECTING = 'CONNECTING',
  /**
   * The connection to remote endpoint is established.
   * The connection is ready to use.
   */
  CONNECTED = 'CONNECTED',
}

/**
 * Connection details that can be used for debugging or logging.
 */
export interface DXLinkConnectionDetails {
  /**
   * Protocol version used for connection to the remote endpoint.
   */
  readonly protocolVersion: string
  /**
   * Version of the client library.
   */
  readonly clientVersion: string
  /**
   * Version of the server which the client is connected to.
   */
  readonly serverVersion?: string
  /**
   * Timeout in seconds for server to detect that client is disconnected.
   * If no keepalive message received from client during this time, server will close connection.
   */
  readonly clientKeepaliveTimeout?: number
  /**
   * Timeout in seconds in for client to detect that server is disconnected.
   * If no keepalive message received from server during this time, client will close connection.
   */
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

/**
 * Listener for errors from the server.
 */
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

  /**
   * Get channel status that can be used to check if channel is available for sending messages.
   */
  getStatus(): DXLinkChannelStatus
  /**
   * Add a listener for channel status changes.
   * If channel is ready to use, listener will be called immediately with {@link DXLinkChannelStatus.OPENED} status.
   * @see {@link DXLinkChannelStatus}
   * Note: when remote endpoint reconnects, channel will be reopened and listener will be called with {@link DXLinkChannelStatus.OPENED} status again.
   * @see {@link DXLinkWebSocketClient.getConnectionState}
   */
  addStatusListener(listener: DXLinkChannelStatusListener): void
  /**
   * Remove a listener for channel status changes.
   */
  removeStatusListener(listener: DXLinkChannelStatusListener): void

  /**
   * Add a listener for errors from the server.
   * @see {@link DXLinkError}
   */
  addErrorListener(listener: DXLinkErrorListener): void
  /**
   * Remove a listener for errors from the server.
   * @see {@link DXLinkError}
   */
  removeErrorListener(listener: DXLinkErrorListener): void

  /**
   * Send an error to the channel.
   * @see {@link DXLinkError}
   */
  error(error: DXLinkError): void

  /**
   * Close the channel and free all resources.
   * This method does nothing if the channel is already closed.
   * The channel {@see DXLinkChannel.getStatus} immediately becomes {@link State#CLOSED CLOSED}.
   * @see {@link DXLinkChannelStatus}
   */
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
  /**
   * Reconnect to the remote endpoint.
   * This method does nothing if the client is not connected.
   * The endpoint {@see DXLinkWebSocketClient.getConnectionState} immediately becomes {@link State#CONNECTING CONNECTING}.
   * @see {@link DXLinkWebSocketClient.connect}
   */
  reconnect(): void
  /**
   * Disconnect from the remote endpoint.
   * This method does nothing if the client is not connected.
   * The endpoint {@see DXLinkWebSocketClient.getConnectionState} immediately becomes {@link State#NOT_CONNECTED NOT_CONNECTED}.
   * @see {@link DXLinkWebSocketClient.connect}
   */
  disconnect(): void

  /**
   * Get connection details that can be used for debugging or logging.
   */
  getConnectionDetails(): DXLinkConnectionDetails

  /**
   * Get connection state that can be used to check if connection is established and ready to use.
   */
  getConnectionState(): DXLinkConnectionState
  addConnectionStateChangeListener(listener: DXLinkConnectionStateChangeListener): void
  removeConnectionStateChangeListener(listener: DXLinkConnectionStateChangeListener): void

  /**
   * Set authorization token to be used for connection to the remote endpoint.
   * This method does nothing if the client is connected.
   * @param token Authorization token to be used for connection.
   */
  setAuthToken(token: string): void
  /**
   * Get authentication state that can be used to check if user is authorized on the remote endpoint.
   */
  getAuthState(): DXLinkAuthState
  /**
   * Add a listener for authentication state changes.
   * When auth state is {@link DXLinkAuthState.UNAUTHORIZED}, you can call {@link DXLinkWebSocketClient.setAuthToken} to authorize the client.
   */
  addAuthStateChangeListener(listener: DXLinkAuthStateChangeListener): void
  removeAuthStateChangeListener(listener: DXLinkAuthStateChangeListener): void

  /**
   * Error listener that can be used to handle errors from the server.
   */
  addErrorListener(listener: DXLinkErrorListener): void
  removeErrorListener(listener: DXLinkErrorListener): void

  /**
   * Open a isolated channel to service withing single {@link DXLinkWebSocketClient} connection to remote endpoint.
   * @param service Name of the service to open channel to.
   * @param parameters Parameters of the service to open channel to.
   * @see {@link DXLinkChannel}
   */
  openChannel(service: string, parameters: Record<string, unknown>): DXLinkChannel
}
