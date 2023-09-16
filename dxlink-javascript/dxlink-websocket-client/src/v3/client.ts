import {
  DXLinkAuthState,
  DXLinkAuthStateChangeListener,
  DXLinkErrorListener,
  DXLinkWebSocketClient,
  DXLinkError,
  DXLinkConnectionDetails,
  DXLinkConnectionStateChangeListener,
  DXLinkConnectionState,
} from './dxlink'
import {
  Message,
  SetupMessage,
  isConnectionMessage,
  AuthStateMessage,
  ErrorMessage,
} from './messages'
import { WebSocketConnector } from './connector'

export interface DXLinkWebSocketConfig {
  readonly keepaliveInterval: number
  readonly keepaliveTimeout: number
  readonly acceptKeepaliveTimeout: number
  readonly actionTimeout: number
}

export const PROTOCOL_VERSION = '0.1'

const DEFAULT_CONNECTION_DETAILS: DXLinkConnectionDetails = {
  protocolVersion: PROTOCOL_VERSION,
  clientVersion: '0.0.0',
}

export class DXLinkWebSocket implements DXLinkWebSocketClient {
  private readonly config: DXLinkWebSocketConfig

  private connector: WebSocketConnector | undefined

  private connectionState: DXLinkConnectionState = DXLinkConnectionState.NOT_CONNECTED
  private connectionDetails: DXLinkConnectionDetails = DEFAULT_CONNECTION_DETAILS

  private authState: DXLinkAuthState = DXLinkAuthState.UNAUTHORIZED

  private readonly connectionStateChangeListeners = new Set<DXLinkConnectionStateChangeListener>()
  private readonly errorListeners = new Set<DXLinkErrorListener>()
  private readonly authStateChangeListeners = new Set<DXLinkAuthStateChangeListener>()

  private timeoutIds: Record<string, any> = {}

  private lastSettedAuthToken: string | undefined

  // TODO: mb move to connector
  private lastReceivedMillis = 0
  private lastSentMillis = 0

  constructor(config?: Partial<DXLinkWebSocketConfig>) {
    this.config = {
      keepaliveInterval: 30,
      keepaliveTimeout: 60,
      acceptKeepaliveTimeout: 60,
      actionTimeout: 10,
      ...config,
    }
  }

  connect = async (url: string): Promise<void> => {
    this.disconnect()

    this.setConnectionState(DXLinkConnectionState.CONNECTING)

    this.connector = new WebSocketConnector(url)
    this.connector.start()

    this.connector.setOpenListener(this.processTransportOpen)
    this.connector.setMessageListener(this.processMessage)
    this.connector.setCloseListener(this.processTransportClose)

    return new Promise((resolve, reject) => {
      const listener: DXLinkConnectionStateChangeListener = (state) => {
        this.removeConnectionStateChangeListener(listener)

        if (state === DXLinkConnectionState.CONNECTED) {
          resolve()
        } else if (state === DXLinkConnectionState.NOT_CONNECTED) {
          reject(new Error('Connection failed'))
        }
      }

      this.addConnectionStateChangeListener(listener)
    })
  }

  disconnect = () => {
    if (this.connectionState === DXLinkConnectionState.NOT_CONNECTED) return

    console.debug('Disconnecting...')

    this.connector?.stop()
    this.connector = undefined

    for (const key of Object.keys(this.timeoutIds)) {
      this.clearTimeout(key)
    }

    // Set initial state
    this.connectionDetails = DEFAULT_CONNECTION_DETAILS
    this.setConnectionState(DXLinkConnectionState.NOT_CONNECTED)
    this.setAuthState(DXLinkAuthState.UNAUTHORIZED)
    this.lastReceivedMillis = 0
    this.lastSentMillis = 0
  }

  getConnectionDetails = () => this.connectionDetails
  getConnectionState = () => this.connectionState
  addConnectionStateChangeListener = (listener: DXLinkConnectionStateChangeListener) =>
    this.connectionStateChangeListeners.add(listener)
  removeConnectionStateChangeListener = (listener: DXLinkConnectionStateChangeListener) =>
    this.connectionStateChangeListeners.delete(listener)

  setAuthToken = (token: string): void => {
    console.debug('Setting auth token', token)
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

  openChannel = (service: string, parameters?: Record<string, unknown> | undefined) => {
    throw new Error('Method not implemented.')
  }

  private setConnectionState = (newStatus: DXLinkConnectionState) => {
    console.debug('Connection status', status)

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

  private sendSetupMessage = (setupMessage: SetupMessage) => {
    // Setup timeout check
    this.timeoutIds['SETUP_TIMEOUT'] = setTimeout(() => {
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

      this.disconnect()
    }, this.config.actionTimeout * 1000)

    this.sendMessage(setupMessage)
  }

  private sendAuthMessage = (token: string): void => {
    this.setAuthState(DXLinkAuthState.AUTHORIZING)

    this.timeoutIds['AUTH_STATE_TIMEOUT'] = setTimeout(() => {
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

      this.disconnect()
    }, this.config.actionTimeout * 1000)

    this.sendMessage({
      type: 'AUTH',
      channel: 0,
      token,
    })
  }

  private setAuthState = (state: DXLinkAuthState): void => {
    const prev = this.authState
    this.authState = state

    for (const listener of this.authStateChangeListeners) {
      try {
        listener(state, prev)
      } catch (e) {
        console.error('Auth state listener error', e)
      }
    }
  }

  private processMessage = (message: Message): void => {
    console.debug('Received message', message)

    this.lastReceivedMillis = Date.now()

    // Send keepalive message if no messages sent for a while (keepaliveInterval)
    // Because browser sometimes doesn't run scheduled tasks when tab is inactive
    if (this.lastReceivedMillis - this.lastSentMillis >= this.config.keepaliveInterval * 1000) {
      this.sendMessage({
        type: 'KEEPALIVE',
        channel: 0,
      })
    }

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
          // Ignore keepalive messages coz we already processed it
          return
      }
    }

    // TODO: process channel messages

    console.warn('Unhandeled message: ', message.type)
  }

  private processSetupMessage = (serverSetup: SetupMessage): void => {
    console.debug('Setup', serverSetup)

    // Clear setup timeout check from connect method
    this.clearTimeout('SETUP_TIMEOUT')

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

      this.setConnectionState(DXLinkConnectionState.CONNECTED)
    }

    // Connection maintance: Setup keepalive timeout check
    const timeoutMills = (serverSetup.keepaliveTimeout ?? 60) * 1000
    this.timeoutIds['TIMEOUT'] = setTimeout(() => this.timeoutCheck(timeoutMills), timeoutMills)
  }

  private publishError = (error: DXLinkError): void => {
    console.debug('Error', error)

    if (this.errorListeners.size === 0) {
      console.error('Unhandled dxLink error', error)
      return
    }

    for (const listener of this.errorListeners) {
      try {
        listener(error)
      } catch (e) {
        console.error('Error listener error', e)
      }
    }
  }

  private processAuthStateMessage = (message: AuthStateMessage): void => {
    console.debug('Auth state', message)

    // Clear auth state timeout check from send method
    this.clearTimeout('AUTH_STATE_TIMEOUT')

    // Reset auth token if server rejected it
    if (message.state === 'UNAUTHORIZED') {
      this.lastSettedAuthToken = undefined
    }

    this.setAuthState(DXLinkAuthState[message.state])
  }

  private processTransportOpen = (): void => {
    console.debug('Connection established')

    const setupMessage: SetupMessage = {
      type: 'SETUP',
      channel: 0,
      version: `${this.connectionDetails.protocolVersion}-${this.connectionDetails.clientVersion}`,
      keepaliveTimeout: this.config.keepaliveTimeout,
      acceptKeepaliveTimeout: this.config.acceptKeepaliveTimeout,
    }

    this.sendSetupMessage(setupMessage)

    if (this.lastSettedAuthToken !== undefined) {
      this.sendAuthMessage(this.lastSettedAuthToken)
    }
  }

  private processTransportClose = (): void => {
    console.debug('Connection closed by server')

    this.disconnect()
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

      // TODO: Should we disconnect here or reconnect?
      return this.disconnect()
    }

    const nextTimeout = Math.max(200, timeoutMills - noKeepaliveDuration)
    clearTimeout(this.timeoutIds['TIMEOUT'])
    this.timeoutIds['TIMEOUT'] = setTimeout(() => this.timeoutCheck(timeoutMills), nextTimeout)
  }

  private scheduleKeepalive = () => {
    this.clearTimeout('KEEPALIVE')

    this.timeoutIds['KEEPALIVE'] = setTimeout(() => {
      this.sendMessage({
        type: 'KEEPALIVE',
        channel: 0,
      })

      this.scheduleKeepalive()
    }, this.config.keepaliveInterval * 1000)
  }

  private clearTimeout = (key: string) => {
    if (this.timeoutIds[key] !== undefined) {
      clearTimeout(this.timeoutIds[key])
      delete this.timeoutIds[key]
    }
  }
}
