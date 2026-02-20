import type { DXLinkLogLevel, DXLinkScheduler } from '@dxfeed/dxlink-core'

import type { DXLinkWebSocketConnector } from './connector'

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
   * If not set, then reconnect attempts are not limited.
   */
  readonly maxReconnectAttempts: number
  /**
   * Scheduler used by the client for reconnect and timeout handling.
   * If not provided, {@link DefaultDXLinkScheduler} is used.
   */
  readonly scheduler?: DXLinkScheduler
  /**
   * Factory function to create a WebSocket connector.
   * This function should return an instance of {@link DXLinkWebSocketConnector} for the given URL.
   * This allows for custom WebSocket implementations or configurations.
   * @param url The URL to connect to.
   * @returns {@link DXLinkWebSocketConnector} instance
   */
  readonly connectorFactory: (url: string) => DXLinkWebSocketConnector
}
