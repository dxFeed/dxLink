import { VERSION } from '../version'
import { AuthManager } from './auth'
import { ChannelManager } from './channels'
import { ConnectionManager } from './connection'
import { ClientConnector, DXLinkWebSocketConnection } from './core'
import { KeepaliveManager } from './keepalive'
import { Multiplexer } from './multiplexer'
import { WebSocketTransport } from './transport'

export interface DXLinkWebSocketConnectorConfig {
  url: string
  keepaliveInterval?: number
  keepaliveTimeout?: number
  acceptKeepaliveTimeout?: number
}

export const DEFAULT_KEEPALIVE_TIMEOUT = 60

export const PROTOCOL_VERSION = '0.1'

export class DXLinkWebSocketConnector implements ClientConnector {
  constructor(private readonly config: DXLinkWebSocketConnectorConfig) {}

  async connect(): Promise<DXLinkWebSocketConnection> {
    const clientSetup = {
      type: 'SETUP',
      channel: 0,
      keepaliveTimeout: this.config.keepaliveTimeout ?? DEFAULT_KEEPALIVE_TIMEOUT,
      acceptKeepaliveTimeout: this.config.acceptKeepaliveTimeout ?? DEFAULT_KEEPALIVE_TIMEOUT,
      version: `${PROTOCOL_VERSION}-${VERSION}`,
    } as const
    const keepaliveInterval = clientSetup.keepaliveTimeout / 2
    const actionTimeout = clientSetup.keepaliveTimeout / 2

    const transport = new WebSocketTransport(this.config.url)

    const transportConnection = await transport.connect()

    try {
      const keepaliveManager = new KeepaliveManager(
        transportConnection,
        keepaliveInterval,
        clientSetup.keepaliveTimeout
      )

      const authManager = new AuthManager(transportConnection)

      const connectionManager = new ConnectionManager(
        transportConnection,
        keepaliveManager,
        authManager
      )

      const channelManager = new ChannelManager(transportConnection)

      const multiplexer = new Multiplexer(transportConnection, connectionManager, channelManager)
      transportConnection.registerHandler(multiplexer)

      // Send setup message to initiate the connection
      transportConnection.send(clientSetup)

      // Await for setup message from server
      const serverSetup = await connectionManager.whenReady(actionTimeout * 1000)

      // Await for auth state from server
      await authManager.whenReady(actionTimeout * 1000)

      const connection: DXLinkWebSocketConnection = {
        clientVersion: clientSetup.version,
        serverVersion: serverSetup.version,

        addLifecycleHandler: connectionManager.addLifecycleHandler,
        removeLifecycleHandler: connectionManager.removeLifecycleHandler,

        auth: authManager.auth,
        getAuthState: authManager.getAuthState,
        openChannel: channelManager.openChannel,
      }

      return connection
    } catch (error) {
      transportConnection.close()

      throw error
    }
  }
}
