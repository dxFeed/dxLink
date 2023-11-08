import type { DXLinkLogLevel } from '@dxfeed/dxlink-core'

/**
 * Options for {@link DXLinkWebSocketClient}.
 */
export interface DXLinkWebSocketClientConfig {
  /**
   * Interval in seconds between keepalive messages which are sent to server.
   */
  readonly keepaliveInterval: number
  /**
   * Timeout in seconds for server to detect that client is disconnected.
   * @see {DXLinkConnectionDetails.clientKeepaliveTimeout}
   */
  readonly keepaliveTimeout: number
  /**
   * Prefered timeout in seconds in for client to detect that server is disconnected.
   * @see {DXLinkConnectionDetails.serverKeepaliveTimeout}
   */
  readonly acceptKeepaliveTimeout: number
  /**
   * Timeout for action which requires update from server.
   */
  readonly actionTimeout: number
  /**
   * Log level for internal logger.
   */
  readonly logLevel: DXLinkLogLevel
  /**
   * Maximum number of reconnect attempts.
   * If connection is not established after this number of attempts, connection will be closed.
   * If 0, then reconnect attempts are not limited.
   */
  readonly maxReconnectAttempts: number
}
