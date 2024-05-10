import {
  DXLinkLogLevel,
  type DXLinkLogger,
  Logger,
  Scheduler,
  type DXLinkConnectionDetails,
  DXLinkConnectionState,
  type DXLinkConnectionStateChangeListener,
  type DXLinkErrorListener,
  DXLinkAuthState,
  DXLinkChannelState,
  type DXLinkAuthStateChangeListener,
  type DXLinkChannel,
  type DXLinkError,
  type DXLinkClient,
} from '@dxfeed/dxlink-core'

import { DXLinkWebSocketChannel } from './channel'
import type { DXLinkWebSocketClientConfig } from './config'
import { WebSocketConnector } from './connector'
import {
  type AuthStateMessage,
  type ErrorMessage,
  type Message,
  type SetupMessage,
  isChannelLifecycleMessage,
  isChannelMessage,
  isConnectionMessage,
} from './messages'
import { VERSION } from './version'

/**
 * Protocol version that is used by client.
 */
export const DXLINK_WS_PROTOCOL_VERSION = '0.1'

const CLIENT_VERSION = `DXF-JS/${VERSION}`

const DEFAULT_CONNECTION_DETAILS: DXLinkConnectionDetails = {
  protocolVersion: DXLINK_WS_PROTOCOL_VERSION,
  clientVersion: CLIENT_VERSION,
}

/**
 * dxLink WebSocket client that can be used to connect to the remote dxLink WebSocket endpoint and open channels to services.
 */
export class DXLinkWebSocketClient implements DXLinkClient {
  private readonly config: DXLinkWebSocketClientConfig

  private readonly logger: DXLinkLogger

  private readonly scheduler = new Scheduler()

  private connector: WebSocketConnector | undefined

  private connectionState: DXLinkConnectionState = DXLinkConnectionState.NOT_CONNECTED
  private connectionDetails: DXLinkConnectionDetails = DEFAULT_CONNECTION_DETAILS

  private authState: DXLinkAuthState = DXLinkAuthState.UNAUTHORIZED

  // Listeners
  private readonly connectionStateChangeListeners = new Set<DXLinkConnectionStateChangeListener>()
  private readonly errorListeners = new Set<DXLinkErrorListener>()
  private readonly authStateChangeListeners = new Set<DXLinkAuthStateChangeListener>()

  /**
   * Authorization type that was determined by server behavior during setup phase.
   * This value is used to determine if authorization is required or optional or not defined yet.
   */
  private isFirstAuthState = true
  /**
   * Last setted auth token that will be sent to server after connection is established or re-established.
   */
  private lastSettedAuthToken: string | undefined

  // Stats for keepalive
  // TODO: mb move to connector
  private lastReceivedMillis = 0
  private lastSentMillis = 0

  /**
   * Count of reconnect attempts since last successful connection.
   */
  private reconnectAttempts = 0

  // Channels
  private globalChannelId = 1
  private readonly channels = new Map<number, DXLinkWebSocketChannel>()

  /**
   * Create new instance of {@link DXLinkWebSocketClient}.
   * @param config Configuration of the client.
   */
  constructor(config?: Partial<DXLinkWebSocketClientConfig>) {
    this.config = {
      keepaliveInterval: 30,
      keepaliveTimeout: 60,
      acceptKeepaliveTimeout: 60,
      actionTimeout: 10,
      logLevel: DXLinkLogLevel.WARN,
      maxReconnectAttempts: -1,
      ...config,
    }

    this.logger = new Logger(this.constructor.name, this.config.logLevel)
  }

  connect = (url: string) => {
    // Do nothing if already connected to the same url
    if (this.connector?.getUrl() === url) return

    // Disconnect from previous connection if any exists
    this.disconnect()

    this.logger.debug('Connecting to', url)

    // Immediately set connection state to CONNECTING
    this.setConnectionState(DXLinkConnectionState.CONNECTING)

    this.connector = new WebSocketConnector(url)
    this.connector.setOpenListener(this.processTransportOpen)
    this.connector.setMessageListener(this.processMessage)
    this.connector.setCloseListener(this.processTransportClose)

    // Initiate websocket connection
    this.connector.start()
  }

  reconnect = () => {
    if (
      this.config.maxReconnectAttempts > 0 &&
      this.reconnectAttempts >= this.config.maxReconnectAttempts
    ) {
      this.logger.warn('Max reconnect attempts reached')

      this.disconnect()
      return
    }

    if (
      this.connectionState === DXLinkConnectionState.NOT_CONNECTED ||
      this.connector === undefined
    )
      return

    this.logger.debug('Trying to reconnect', this.connector.getUrl())

    this.connector.stop()

    // Clear all timeouts
    this.scheduler.clear()

    // Set initial state
    this.connectionDetails = DEFAULT_CONNECTION_DETAILS
    this.lastReceivedMillis = 0
    this.lastSentMillis = 0
    this.isFirstAuthState = true

    // Increase reconnect attempts counter
    this.reconnectAttempts++

    // Update state for connection and channels
    this.setConnectionState(DXLinkConnectionState.CONNECTING)
    for (const channel of this.channels.values()) {
      if (channel.getState() === DXLinkChannelState.CLOSED) continue

      channel.processStatusRequested()
    }

    // Schedule reconnect attempt after some time
    // Additionally, task will be executed in case when tab is active again
    // coz browser sometimes doesn't run scheduled tasks when tab is inactive
    this.scheduler.schedule(
      () => {
        if (this.connector === undefined) return

        // Start new connection attempt
        this.connector.start()
      },
      this.reconnectAttempts * 1000,
      'RECONNECT'
    )
  }

  disconnect = () => {
    if (this.connectionState === DXLinkConnectionState.NOT_CONNECTED) return

    this.logger.debug('Disconnecting')

    // Destroy connector
    this.connector?.stop()
    this.connector = undefined

    // Clear all timeouts
    this.scheduler.clear()

    // Set initial state
    this.connectionDetails = DEFAULT_CONNECTION_DETAILS
    this.lastReceivedMillis = 0
    this.lastSentMillis = 0
    this.isFirstAuthState = true
    this.reconnectAttempts = 0

    this.setConnectionState(DXLinkConnectionState.NOT_CONNECTED)
    this.setAuthState(DXLinkAuthState.UNAUTHORIZED)
  }

  close = () => {
    this.disconnect()
  }

  getConnectionDetails = () => this.connectionDetails
  getConnectionState = () => this.connectionState
  addConnectionStateChangeListener = (listener: DXLinkConnectionStateChangeListener) =>
    this.connectionStateChangeListeners.add(listener)
  removeConnectionStateChangeListener = (listener: DXLinkConnectionStateChangeListener) =>
    this.connectionStateChangeListeners.delete(listener)

  setAuthToken = (token: string): void => {
    this.lastSettedAuthToken = token

    if (this.connectionState === DXLinkConnectionState.CONNECTED) {
      this.sendAuthMessage(token)
    }
  }

  getAuthState = (): DXLinkAuthState => this.authState
  addAuthStateChangeListener = (listener: DXLinkAuthStateChangeListener) =>
    this.authStateChangeListeners.add(listener)
  removeAuthStateChangeListener = (listener: DXLinkAuthStateChangeListener) =>
    this.authStateChangeListeners.delete(listener)

  addErrorListener = (listener: DXLinkErrorListener) => this.errorListeners.add(listener)
  removeErrorListener = (listener: DXLinkErrorListener) => this.errorListeners.delete(listener)

  openChannel = (service: string, parameters: Record<string, unknown>): DXLinkChannel => {
    const channelId = this.globalChannelId
    this.globalChannelId += 2

    const channel = new DXLinkWebSocketChannel(
      channelId,
      service,
      parameters,
      this.sendMessage,
      this.config
    )

    this.channels.set(channelId, channel)

    // Send channel request if connection is already established
    if (
      this.connectionState === DXLinkConnectionState.CONNECTED &&
      this.authState === DXLinkAuthState.AUTHORIZED
    ) {
      channel.request()
    }

    return channel
  }

  private setConnectionState = (newStatus: DXLinkConnectionState) => {
    const prev = this.connectionState
    if (prev === newStatus) return

    this.connectionState = newStatus
    for (const listener of this.connectionStateChangeListeners) {
      listener(newStatus, prev)
    }
  }

  private sendMessage = (message: Message): void => {
    this.connector?.sendMessage(message)

    this.scheduleKeepalive()

    // TODO: mb move to connector
    this.lastSentMillis = Date.now()
  }

  private sendAuthMessage = (token: string): void => {
    this.logger.debug('Sending auth message')

    this.setAuthState(DXLinkAuthState.AUTHORIZING)

    this.sendMessage({
      type: 'AUTH',
      channel: 0,
      token,
    })
  }

  private setAuthState = (newState: DXLinkAuthState): void => {
    const prev = this.authState

    this.authState = newState
    for (const listener of this.authStateChangeListeners) {
      try {
        listener(newState, prev)
      } catch (e) {
        this.logger.error('Auth state listener error', e)
      }
    }
  }

  private processMessage = (message: Message): void => {
    this.lastReceivedMillis = Date.now()

    // Send keepalive message if no messages sent for a while (keepaliveInterval)
    // Because browser sometimes doesn't run scheduled tasks when tab is inactive
    if (this.lastReceivedMillis - this.lastSentMillis >= this.config.keepaliveInterval * 1000) {
      this.sendMessage({
        type: 'KEEPALIVE',
        channel: 0,
      })
    }

    // Connection messages are messages that are sent to the channel 0
    if (isConnectionMessage(message)) {
      switch (message.type) {
        case 'SETUP':
          return this.processSetupMessage(message)
        case 'AUTH_STATE':
          return this.processAuthStateMessage(message)
        case 'ERROR':
          return this.publishError({
            type: message.error,
            message: message.message,
          })
        case 'KEEPALIVE':
          // Ignore keepalive messages coz they are used only to maintain connection
          return
      }
    } else if (isChannelMessage(message)) {
      const channel = this.channels.get(message.channel)
      if (channel === undefined) {
        this.logger.warn('Received lifecycle message for unknown channel', message)
        return
      }

      if (isChannelLifecycleMessage(message)) {
        switch (message.type) {
          case 'CHANNEL_OPENED':
            return channel.processStatusOpened()
          case 'CHANNEL_CLOSED':
            return channel.processStatusClosed()
          case 'ERROR':
            return channel.processError({
              type: message.error,
              message: message.message,
            })
        }
        return
      }

      return channel.processPayloadMessage(message)
    }

    this.logger.warn('Unhandeled message', message.type)
  }

  private processSetupMessage = (serverSetup: SetupMessage): void => {
    // Clear setup timeout check from connect method
    this.scheduler.cancel('SETUP_TIMEOUT')

    // Mark connection as connected after first setup message and subsequent ones
    if (
      this.connectionState === DXLinkConnectionState.CONNECTING ||
      this.connectionState === DXLinkConnectionState.CONNECTED
    ) {
      this.connectionDetails = {
        ...this.connectionDetails,
        serverVersion: serverSetup.version,
        clientKeepaliveTimeout: this.config.keepaliveTimeout,
        serverKeepaliveTimeout: serverSetup.keepaliveTimeout,
      }

      // Reset reconnect attempts counter after successful connection
      this.reconnectAttempts = 0

      if (this.lastSettedAuthToken === undefined) {
        this.setConnectionState(DXLinkConnectionState.CONNECTED)
      }
    }

    // Connection maintance: Setup keepalive timeout check
    const timeoutMills = (serverSetup.keepaliveTimeout ?? 60) * 1000
    this.scheduler.schedule(() => this.timeoutCheck(timeoutMills), timeoutMills, 'TIMEOUT')
  }

  private publishError = (error: DXLinkError): void => {
    this.logger.debug('Publishing error', error)

    if (this.errorListeners.size === 0) {
      this.logger.error('Unhandled dxLink error', error)
      return
    }

    for (const listener of this.errorListeners) {
      try {
        listener(error)
      } catch (e) {
        this.logger.error('Error listener error', e)
      }
    }
  }

  private processAuthStateMessage = ({ state }: AuthStateMessage): void => {
    this.logger.debug('Received auth state message', state)

    // Clear auth state timeout check
    this.scheduler.cancel('AUTH_STATE_TIMEOUT')

    // Ignore first auth state message because it is sent during connection setup
    if (this.isFirstAuthState) {
      this.isFirstAuthState = false
    } else {
      // Reset auth token if server rejected it
      if (state === 'UNAUTHORIZED') {
        this.lastSettedAuthToken = undefined
      }
    }

    // Request active channels if connection is authorized
    if (state === 'AUTHORIZED') {
      this.setConnectionState(DXLinkConnectionState.CONNECTED)

      this.requestActiveChannels()
    }

    this.setAuthState(DXLinkAuthState[state])
  }

  private requestActiveChannels = (): void => {
    for (const channel of this.channels.values()) {
      // clear closed channels
      if (channel.getState() === DXLinkChannelState.CLOSED) {
        this.channels.delete(channel.id)
        continue
      }

      channel.request()
    }
  }

  /**
   * Process transport open event from connector.
   * After transport is opened:
   * - setup message is sent to server
   * - auth message is sent to server if auth token is set
   * - wait for setup message from server
   * - wait for auth state message from server
   */
  private processTransportOpen = (): void => {
    this.logger.debug('Connection opened')

    const setupMessage: SetupMessage = {
      type: 'SETUP',
      channel: 0,
      version: `${this.connectionDetails.protocolVersion}-${this.connectionDetails.clientVersion}`,
      keepaliveTimeout: this.config.keepaliveTimeout,
      acceptKeepaliveTimeout: this.config.acceptKeepaliveTimeout,
    }

    // Setup timeout check
    this.scheduler.schedule(
      () => {
        const errorMessage: ErrorMessage = {
          type: 'ERROR',
          channel: 0,
          error: 'TIMEOUT',
          message: 'No setup message received for ' + this.config.actionTimeout + 's',
        }

        this.sendMessage(errorMessage)

        this.publishError({
          type: errorMessage.error,
          message: `${errorMessage.message} from server`,
        })

        // Disconnect if no setup message received
        this.reconnect()
      },
      this.config.actionTimeout * 1000,
      'SETUP_TIMEOUT'
    )

    this.sendMessage(setupMessage)

    this.scheduler.schedule(
      () => {
        const errorMessage: ErrorMessage = {
          type: 'ERROR',
          channel: 0,
          error: 'TIMEOUT',
          message: 'No auth state message received for ' + this.config.actionTimeout + 's',
        }

        this.sendMessage(errorMessage)

        this.publishError({
          type: errorMessage.error,
          message: `${errorMessage.message} from server`,
        })

        // Disconnect if no auth state message received
        this.reconnect()
      },
      this.config.actionTimeout * 1000,
      'AUTH_STATE_TIMEOUT'
    )

    if (this.lastSettedAuthToken !== undefined) {
      this.sendAuthMessage(this.lastSettedAuthToken)
    }
  }

  /**
   *  Process transport close event from connector.
   *  After transport is closed by server:
   * - reconnect if connection is authorized
   * - disconnect if connection is not authorized
   */
  private processTransportClose = (reason: string, error: boolean): void => {
    this.logger.debug('Connection closed', reason)

    if (error !== undefined) {
      this.publishError({
        type: 'UNKNOWN',
        message: reason,
      })
    }

    if (this.authState === DXLinkAuthState.UNAUTHORIZED) {
      this.lastSettedAuthToken = undefined
      this.disconnect()
      return
    }

    this.reconnect()
  }

  private timeoutCheck = (timeoutMills: number) => {
    const now = Date.now()
    const noKeepaliveDuration = now - this.lastReceivedMillis
    if (noKeepaliveDuration >= timeoutMills) {
      this.sendMessage({
        type: 'ERROR',
        channel: 0,
        error: 'TIMEOUT',
        message: 'No keepalive received for ' + noKeepaliveDuration + 'ms',
      })

      return this.reconnect()
    }

    const nextTimeout = Math.max(200, timeoutMills - noKeepaliveDuration)
    this.scheduler.schedule(() => this.timeoutCheck(timeoutMills), nextTimeout, 'TIMEOUT')
  }

  private scheduleKeepalive = () => {
    this.scheduler.schedule(
      () => {
        this.sendMessage({
          type: 'KEEPALIVE',
          channel: 0,
        })

        this.scheduleKeepalive()
      },
      this.config.keepaliveInterval * 1000,
      'KEEPALIVE'
    )
  }
}
