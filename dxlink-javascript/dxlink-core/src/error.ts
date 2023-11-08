/**
 * Error type that can be used to handle errors or send them to the remote endpoint.
 */
export type DXLinkErrorType =
  | 'UNKNOWN'
  | 'UNSUPPORTED_PROTOCOL'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'INVALID_MESSAGE'
  | 'BAD_ACTION'

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
}

/**
 * Listener for errors from the server.
 * @see {DXLinkWebSocketClient.addErrorListener}
 */
export type DXLinkErrorListener = (error: DXLinkError) => void
