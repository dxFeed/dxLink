/**
 * Error type of the dxLink protocol ERROR message, which either side can send.
 * - `UNSUPPORTED_PROTOCOL`: the protocol versions of the client and the server do not match.
 * - `TIMEOUT`: an expected message did not arrive in time.
 * - `UNAUTHORIZED`: authorization was refused, expired or is required.
 * - `INVALID_MESSAGE`: a received message could not be parsed.
 * - `BAD_ACTION`: a received message violates the protocol.
 * - `UNKNOWN`: an unexpected error on the side that sent it.
 */
export type DXLinkProtocolErrorType =
  'UNKNOWN' | 'UNSUPPORTED_PROTOCOL' | 'TIMEOUT' | 'UNAUTHORIZED' | 'INVALID_MESSAGE' | 'BAD_ACTION'

/**
 * Error type the client detects itself. It is never sent to the remote endpoint.
 * - `CONNECT_FAILED`: the connection could not be established: it did not open (network, DNS, TLS,
 *   proxy, Content Security Policy, handshake refused) or it closed before it was authorized.
 * - `CONNECTION_LOST`: an established connection closed unexpectedly.
 */
export type DXLinkClientErrorType = 'CONNECT_FAILED' | 'CONNECTION_LOST'

/**
 * Error type, a category that tells where an error comes from.
 */
export type DXLinkErrorType = DXLinkProtocolErrorType | DXLinkClientErrorType

/**
 * Unified error that can be used to handle errors or send them to the remote endpoint.
 * @see {DXLinkChannel.error}
 * @see {DXLinkWebSocketClient.addErrorListener}
 */
export interface DXLinkError {
  /**
   * Type of the error.
   * @example 'TIMEOUT'
   */
  readonly type: DXLinkErrorType
  /**
   * Message of the error with details.
   * @example 'Timeout exceeded'
   */
  readonly message: string
  /**
   * WebSocket close code of the connection the error closed, if any.
   * @example 1006
   */
  readonly closeCode?: number
  /**
   * Whether the client stopped connecting because of the error. It does not reconnect until
   * {@link DXLinkClient.connect} is called again.
   */
  readonly final?: boolean
}

/**
 * Listener for errors from the server.
 * @see {DXLinkWebSocketClient.addErrorListener}
 */
export type DXLinkErrorListener = (error: DXLinkError) => void
