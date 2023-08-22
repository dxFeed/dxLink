import { VERSION } from '../version'
import { AuthManager } from './auth'
import { DXLinkChannelManager } from './channels'
import { ConnectionManager } from './connection'
import { ClientConnector, DXLinkWebSocketConnection } from './core'
import { ChannelMessageHandler, ConnectionMessageHandler, TransportHandler } from './handler'
import { KeepaliveManager } from './keepalive'
import {
  Message,
  isChannelLifecycleMessage,
  isChannelPayloadMessage,
  isConnectionMessage,
} from './messages'
import { WebSocketTransport, TransportConnection } from './transport'

class DXLinkTransportHandler implements TransportHandler {
  constructor(
    private readonly connection: TransportConnection,
    private readonly connectionMessageHandler: ConnectionMessageHandler,
    private readonly channelMessageHandler: ChannelMessageHandler
  ) {}

  handleMessage(message: Message): void {
    if (isConnectionMessage(message)) {
      return this.connectionMessageHandler.handleMessage(message)
    }
    if (isChannelLifecycleMessage(message)) {
      return this.channelMessageHandler.handleLifecycle(message)
    }
    if (isChannelPayloadMessage(message)) {
      return this.channelMessageHandler.handleChannelPayload(message)
    }

    this.connection.send({
      type: 'ERROR',
      channel: 0,
      error: 'INVALID_MESSAGE',
      message: 'Unknown message type ' + message.type + ' received',
    })

    console.warn('Unknown message', message)
  }

  handleError(error: Error): void {
    console.error('Transport error', error)
  }

  handleClose(): void {
    this.connectionMessageHandler.handleClose()
  }
}

export interface DXLinkWebSocketConnectorConfig {
  url: string
  keepaliveInterval?: number
  keepaliveTimeout?: number
  acceptKeepaliveTimeout?: number
}

export const DEFAULT_KEEPALIVE_TIMEOUT = 60

export class DXLinkWebSocketConnector implements ClientConnector {
  constructor(private readonly config: DXLinkWebSocketConnectorConfig) {}

  async connect(): Promise<DXLinkWebSocketConnection> {
    const clientSetup = {
      type: 'SETUP',
      channel: 0,
      keepaliveTimeout: this.config.keepaliveTimeout ?? DEFAULT_KEEPALIVE_TIMEOUT,
      acceptKeepaliveTimeout: this.config.acceptKeepaliveTimeout ?? DEFAULT_KEEPALIVE_TIMEOUT,
      version: `0.1-${VERSION}`,
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

      const channelManager = new DXLinkChannelManager(transportConnection)

      const handler = new DXLinkTransportHandler(
        transportConnection,
        connectionManager,
        channelManager
      )
      transportConnection.registerHandler(handler)

      // Send setup message to initiate the connection
      transportConnection.send(clientSetup)

      const serverSetup = await connectionManager.whenReady(actionTimeout * 1000)

      // Await for auth state from server
      await authManager.whenReady(actionTimeout * 1000)

      const connection: DXLinkWebSocketConnection = {
        clientVersion: clientSetup.version,
        serverVersion: serverSetup.version,

        addLifecycleHandler: connectionManager.addLifecycleHandler,
        removeLifecycleHandler: connectionManager.removeLifecycleHandler,

        auth: authManager.auth,
        openChannel: channelManager.openChannel,
      }

      return connection
    } catch (e) {
      transportConnection.close()

      throw e
    }
  }
}
