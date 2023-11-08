import type { DXLinkAuthState, DXLinkAuthStateChangeListener } from './auth'
import type { DXLinkChannel } from './channel'
import type { DXLinkErrorListener } from './error'

/**
 * Connection state that can be used to check if connection is established and ready to use.
 * @see {DXLinkClient.getConnectionState}
 */
export enum DXLinkConnectionState {
  /**
   * Client was created and not connected to remote endpoint.
   * @see {DXLinkClient.connect}
   */
  NOT_CONNECTED = 'NOT_CONNECTED',
  /**
   * The {@link DXLinkClient.connect} method was called to establish connection or {@link DXLinkClient.reconnect} is in progress.
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
 * dxLink client that can be used to connect to the remote dxLink endpoint and open channels to services.
 */
export interface DXLinkClient {
  /**
   * Connect to the remote endpoint.
   * Connects to the specified remote address. Previously established connections are closed if the new address is different from the old one.
   * This method does nothing if address does not change.
   * The endpoint {@see DXLinkWebSocketClient.getConnectionState} immediately becomes {@link State#CONNECTING CONNECTING}.
   *
   * For connection with the authorization token, use {@link DXLinkClient.setAuthToken} before calling this method.
   * If the token is not set, the connection will be established without authorization.
   *
   * @param url WebSocket URL to connect to.
   */
  connect(url: string): void
  /**
   * Reconnect to the remote endpoint.
   * This method does nothing if the client is not connected.
   * The endpoint {@see DXLinkWebSocketClient.getConnectionState} immediately becomes {@link State#CONNECTING CONNECTING}.
   * @see {DXLinkClient.connect}
   */
  reconnect(): void
  /**
   * Disconnect from the remote endpoint.
   * This method does nothing if the client is not connected.
   * The endpoint {@see DXLinkWebSocketClient.getConnectionState} immediately becomes {@link State#NOT_CONNECTED NOT_CONNECTED}.
   * @see {DXLinkClient.connect}
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
  /**
   * Add a listener for connection state changes.
   */
  addConnectionStateChangeListener(listener: DXLinkConnectionStateChangeListener): void
  /**
   * Remove a listener for connection state changes.
   */
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
   * When auth state is {@link DXLinkAuthState.UNAUTHORIZED}, you can call {@link DXLinkClient.setAuthToken} to authorize the client.
   */
  addAuthStateChangeListener(listener: DXLinkAuthStateChangeListener): void
  /**
   * Remove a listener for authentication state changes.
   */
  removeAuthStateChangeListener(listener: DXLinkAuthStateChangeListener): void

  /**
   * Error listener that can be used to handle errors from the server.
   */
  addErrorListener(listener: DXLinkErrorListener): void
  /**
   * Remove a listener for errors from the server.
   */
  removeErrorListener(listener: DXLinkErrorListener): void

  /**
   * Open a isolated channel to service withing single {@link DXLinkClient} connection to remote endpoint.
   * @param service Name of the service to open channel to.
   * @param parameters Parameters of the service to open channel to.
   * @see {DXLinkChannel}
   */
  openChannel(service: string, parameters: Record<string, unknown>): DXLinkChannel

  /**
   * Close the client and free all resources.
   * This method works the same as {@link DXLinkClient.disconnect}.
   */
  close(): void
}
