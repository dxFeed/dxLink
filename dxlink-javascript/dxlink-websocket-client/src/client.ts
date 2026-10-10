import {
  DXLinkLogLevel,
  type DXLinkLogger,
  Logger,
  type DXLinkScheduler,
  DefaultDXLinkScheduler,
  type DXLinkConnectionDetails,
  DXLinkConnectionState,
  type DXLinkConnectionStateChangeListener,
  type DXLinkErrorListener,
  DXLinkAuthState,
  DXLinkChannelState,
  type DXLinkAuthStateChangeListener,
  type DXLinkChannel,
  type DXLinkChannelOptions,
  type DXLinkError,
  type DXLinkClient,
} from '@dxfeed/dxlink-core'

import { DXLinkWebSocketChannel } from './channel'
import type { DXLinkWebSocketClientConfig } from './config'
import { type DXLinkWebSocketConnector, DefaultDXLinkWebSocketConnector } from './connector'
import {
  type AuthStateMessage,
  type ErrorMessage,
  type DXLinkWebSocketMessage,
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

// Scheduler keys
const DXLWS_SCHEDULER_KEY_RECONNECT = 'DXLWS_RECONNECT'
const DXLWS_SCHEDULER_KEY_SETUP_TIMEOUT = 'DXLWS_SETUP_TIMEOUT'
const DXLWS_SCHEDULER_KEY_AUTH_STATE_TIMEOUT = 'DXLWS_AUTH_STATE_TIMEOUT'
const DXLWS_SCHEDULER_KEY_TIMEOUT = 'DXLWS_TIMEOUT'
const DXLWS_SCHEDULER_KEY_KEEPALIVE = 'DXLWS_KEEPALIVE'

/**
 * Delay before the first reconnect attempt. It doubles with each further attempt.
 */
const RECONNECT_BASE_DELAY_MS = 1000

/**
 * Default of {@link DXLinkWebSocketClientConfig.maxReconnectDelay} in seconds.
 */
const DEFAULT_MAX_RECONNECT_DELAY = 30

/**
 * Longest delay timers accept; a longer one overflows and fires immediately.
 */
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1

/**
 * Removes credentials, query and fragment from the URL, so that it can be logged.
 */
const toLoggableUrl = (url: string): string => {
  try {
    const { protocol, host, pathname } = new URL(url)
    return `${protocol}//${host}${pathname}`
  } catch {
    // Not parsable here (e.g. a scheme-relative URL): cut the query and fragment, then credentials
    return (url.split(/[?#]/)[0] ?? url).replace(/\/\/[^/@]*@/, '//')
  }
}

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

  private readonly scheduler: DXLinkScheduler

  private connector: DXLinkWebSocketConnector | undefined

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
   * Count of reconnect attempts since the connection was last authorized.
   */
  private reconnectAttempts = 0

  /**
   * Last error that failed a connection since it was last authorized, reported when the client stops connecting.
   */
  private lastError: DXLinkError | undefined

  /**
   * Error from the server on the current connection that reconnecting does not fix: refused authorization,
   * unsupported protocol or rejected setup. The client stops connecting when the connection closes.
   */
  private terminalError: DXLinkError | undefined

  /**
   * URL of the endpoint without credentials, query and fragment, for logs.
   */
  private loggableUrl = 'no endpoint'

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
      maxReconnectDelay: DEFAULT_MAX_RECONNECT_DELAY,
      connectorFactory: (url) => new DefaultDXLinkWebSocketConnector(url),
      ...config,
    }

    this.logger = new Logger(this.constructor.name, this.config.logLevel)
    this.scheduler = this.config.scheduler ?? new DefaultDXLinkScheduler()
  }

  connect = (url: string) => {
    // Do nothing if already connected to the same url
    if (this.connector?.getUrl() === url) return

    // Disconnect from previous connection if any exists
    this.disconnect()

    this.logger.debug('Connecting to', url)
    this.loggableUrl = toLoggableUrl(url)

    // Immediately set connection state to CONNECTING
    this.setConnectionState(DXLinkConnectionState.CONNECTING)

    // Create new connector
    this.connector = this.config.connectorFactory(url)
    this.connector.setOpenListener(this.processTransportOpen)
    this.connector.setMessageListener(this.processMessage)
    this.connector.setCloseListener(this.processTransportClose)

    // Initiate websocket connection
    this.connector.start()
  }

  reconnect = () => {
    if (
      this.connectionState === DXLinkConnectionState.NOT_CONNECTED ||
      this.connector === undefined
    )
      return

    if (
      this.config.maxReconnectAttempts >= 0 &&
      this.reconnectAttempts >= this.config.maxReconnectAttempts
    ) {
      const lastError = this.lastError
      this.stopConnecting({
        type: lastError?.type ?? 'UNKNOWN',
        message:
          lastError !== undefined
            ? `Max reconnect attempts reached. Last error: ${lastError.message}`
            : 'Max reconnect attempts reached',
      })
      return
    }

    this.connector.stop()

    // Clear all timeouts
    this.scheduler.clear()

    // Set initial state
    this.connectionDetails = DEFAULT_CONNECTION_DETAILS
    this.lastReceivedMillis = 0
    this.lastSentMillis = 0
    this.isFirstAuthState = true
    this.terminalError = undefined

    // Increase reconnect attempts counter
    this.reconnectAttempts++

    // Update state for connection and channels
    this.setConnectionState(DXLinkConnectionState.CONNECTING)
    for (const channel of this.channels.values()) {
      if (channel.getState() === DXLinkChannelState.CLOSED) continue

      if (!channel.reconnect) {
        // Closed instead of requested again: tell the channel why, so that its service does not end silently
        if (this.lastError !== undefined) channel.processError(this.lastError)
        channel.processStatusClosed()
        continue
      }

      channel.processStatusRequested()
    }

    const delay = this.getReconnectDelay(this.reconnectAttempts)
    this.logger.debug('Trying to reconnect to', this.loggableUrl, 'in', delay, 'ms')

    // Schedule reconnect attempt after some time
    // Additionally, task will be executed in case when tab is active again
    // coz browser sometimes doesn't run scheduled tasks when tab is inactive
    this.scheduler.schedule(
      () => {
        if (this.connector === undefined) return

        // Start new connection attempt
        this.connector.start()
      },
      delay,
      DXLWS_SCHEDULER_KEY_RECONNECT
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
    this.lastError = undefined
    this.terminalError = undefined

    this.setConnectionState(DXLinkConnectionState.NOT_CONNECTED)
    this.setAuthState(DXLinkAuthState.UNAUTHORIZED)
  }

  close = () => {
    this.disconnect()
  }

  getConnectionDetails = () => this.connectionDetails
  getConnectionState = () => this.connectionState
  getScheduler = () => this.scheduler
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

  openChannel = (
    service: string,
    parameters: Record<string, unknown>,
    options?: DXLinkChannelOptions
  ): DXLinkChannel => {
    const channelId = this.globalChannelId
    this.globalChannelId += 2

    const channel = new DXLinkWebSocketChannel(
      channelId,
      service,
      parameters,
      options?.reconnect ?? true,
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

  private sendMessage = (message: DXLinkWebSocketMessage): void => {
    // Not connected, e.g. a channel closed by a listener after the client stopped: no keepalive to keep up
    if (this.connector === undefined) return

    this.connector.sendMessage(message)

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

  private processMessage = (message: DXLinkWebSocketMessage): void => {
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
          return this.processErrorMessage(message)
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

    this.logger.warn('Unhandled message', message.type)
  }

  private processSetupMessage = (serverSetup: SetupMessage): void => {
    // Clear setup timeout check from connect method
    this.scheduler.cancel(DXLWS_SCHEDULER_KEY_SETUP_TIMEOUT)

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

      if (this.lastSettedAuthToken === undefined) {
        this.setConnectionState(DXLinkConnectionState.CONNECTED)
      }
    }

    // Connection maintance: Setup keepalive timeout check
    const timeoutMills = (serverSetup.keepaliveTimeout ?? 60) * 1000
    this.scheduler.schedule(
      () => this.timeoutCheck(timeoutMills),
      timeoutMills,
      DXLWS_SCHEDULER_KEY_TIMEOUT
    )
  }

  /**
   * Process an ERROR message the server sent on the connection channel.
   */
  private processErrorMessage = ({ error: type, message }: ErrorMessage): void => {
    const error: DXLinkError = { type, message }

    if (type === 'UNAUTHORIZED' && this.authState !== DXLinkAuthState.AUTHORIZED) {
      this.terminalError = this.authorizationRefused(message)
    } else if (
      type === 'UNSUPPORTED_PROTOCOL' ||
      // The server rejects the SETUP message itself, e.g. its keepalive values
      (type === 'BAD_ACTION' && this.connectionDetails.serverVersion === undefined)
    ) {
      this.terminalError = error
    }

    this.publishError(error)
  }

  private authorizationRefused = (reason?: string): DXLinkError => ({
    type: 'UNAUTHORIZED',
    message:
      reason !== undefined && reason !== ''
        ? `Authorization refused by the server: ${reason}`
        : 'Authorization refused by the server',
  })

  /**
   * Publish an error that failed the connection, kept to explain why the client stops connecting.
   */
  private publishConnectionError = (error: DXLinkError): void => {
    this.lastError = error
    this.publishError(error)
  }

  private publishError = (error: DXLinkError): void => {
    this.logger.debug('Publishing error', error)

    if (this.errorListeners.size === 0) {
      // Details go into the text: log pipelines that stringify arguments print an object as [object Object]
      this.logger.error(
        `Unhandled dxLink error (${this.loggableUrl}): ${error.type}: ${error.message}`
      )
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
    this.scheduler.cancel(DXLWS_SCHEDULER_KEY_AUTH_STATE_TIMEOUT)

    // Ignore first auth state message because it is sent during connection setup
    if (this.isFirstAuthState) {
      this.isFirstAuthState = false
    } else {
      // Reset auth token if server rejected it
      if (state === 'UNAUTHORIZED') {
        this.lastSettedAuthToken = undefined
        // Keep the reason if the server has already sent it in an ERROR message
        if (this.terminalError === undefined) {
          this.terminalError = this.authorizationRefused()
        }
      }
    }

    // Request active channels if connection is authorized
    if (state === 'AUTHORIZED') {
      // The connection is usable: the next failure starts the backoff and the attempt count over
      this.reconnectAttempts = 0
      this.lastError = undefined
      this.terminalError = undefined

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

        this.publishConnectionError({
          type: errorMessage.error,
          message: `${errorMessage.message} from server`,
        })

        // Disconnect if no setup message received
        this.reconnect()
      },
      this.config.actionTimeout * 1000,
      DXLWS_SCHEDULER_KEY_SETUP_TIMEOUT
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

        this.publishConnectionError({
          type: errorMessage.error,
          message: `${errorMessage.message} from server`,
        })

        // Disconnect if no auth state message received
        this.reconnect()
      },
      this.config.actionTimeout * 1000,
      DXLWS_SCHEDULER_KEY_AUTH_STATE_TIMEOUT
    )

    if (this.lastSettedAuthToken !== undefined) {
      this.sendAuthMessage(this.lastSettedAuthToken)
    }
  }

  /**
   *  Process transport close event from connector.
   *  After transport is closed:
   * - disconnect if the server sent an error that reconnecting does not fix, or requires a token and none is set
   * - reconnect otherwise, including when the connection failed before the server answered
   */
  private processTransportClose = (reason: string, error: boolean, code?: number): void => {
    this.logger.debug('Connection closed', reason, code)

    if (this.terminalError !== undefined) {
      this.stopConnecting(this.terminalError)
      return
    }

    // A clean close of an authorized connection, without a reason, is routine (e.g. load balancing)
    if (error || reason !== '' || this.authState !== DXLinkAuthState.AUTHORIZED) {
      const details = code !== undefined ? ` (code ${code})` : ''
      this.publishConnectionError({
        type: 'UNKNOWN',
        message: `${reason || 'Connection closed'}${details}`,
      })
    }

    // The server closed a connection that waited for a token. A dropped one is retried:
    // the token may be set by the time it reconnects.
    if (!error && this.isTokenMissing()) {
      this.stopConnecting({
        type: 'UNAUTHORIZED',
        message: 'Authorization is required, but no token is set',
      })
      return
    }

    this.reconnect()
  }

  /**
   * Checks if the server requires authorization on the current connection and no token is set.
   */
  private isTokenMissing = (): boolean =>
    !this.isFirstAuthState &&
    this.authState === DXLinkAuthState.UNAUTHORIZED &&
    this.lastSettedAuthToken === undefined

  /**
   * Stops connecting after a failure that reconnecting does not fix, and reports the error to the error
   * listeners and to the channels that are not closed. The channels are requested again by the next
   * successful {@link DXLinkWebSocketClient.connect}, except those opened without reconnect: they are closed.
   */
  private stopConnecting = (error: DXLinkError): void => {
    this.logger.debug('Stopped connecting', error)

    this.disconnect()
    this.publishError(error)

    const channels = [...this.channels.values()].filter(
      (channel) => channel.getState() !== DXLinkChannelState.CLOSED
    )
    for (const channel of channels) {
      // A listener has connected the client again: the new connection requests the channels
      if (this.connectionState !== DXLinkConnectionState.NOT_CONNECTED) break
      // A listener may have closed the channel meanwhile
      if (channel.getState() !== DXLinkChannelState.CLOSED) channel.processError(error)
    }

    for (const channel of channels) {
      if (channel.getState() === DXLinkChannelState.CLOSED) continue

      if (!channel.reconnect) {
        channel.processStatusClosed()
        continue
      }

      channel.processStatusRequested()
    }
  }

  /**
   * Returns the delay before the given reconnect attempt: exponential backoff up to
   * {@link DXLinkWebSocketClientConfig.maxReconnectDelay}, randomized between half and full value.
   */
  private getReconnectDelay = (attempt: number): number => {
    const { maxReconnectDelay } = this.config
    // Fall back to the default for a missing or invalid value, e.g. an explicit undefined
    const maxDelayMs =
      maxReconnectDelay > 0
        ? Math.min(maxReconnectDelay * 1000, MAX_TIMER_DELAY_MS)
        : DEFAULT_MAX_RECONNECT_DELAY * 1000
    const delay = Math.min(maxDelayMs, RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1))

    return Math.round(delay / 2 + (Math.random() * delay) / 2)
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
    this.scheduler.schedule(
      () => this.timeoutCheck(timeoutMills),
      nextTimeout,
      DXLWS_SCHEDULER_KEY_TIMEOUT
    )
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
      DXLWS_SCHEDULER_KEY_KEEPALIVE
    )
  }
}
