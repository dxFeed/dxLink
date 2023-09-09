import {
  DXLinkAuthState,
  DXLinkAuthStateChangeListener,
  DXLinkChannel,
  DXLinkConnectionState,
  DXLinkConnectionStateChangeListener,
  DXLinkConnectionStatus,
  DXLinkErrorListener,
  DXLinkWebSocketClient,
  DXLinkError,
} from './dxlink'
import { WebSocketTransport, WebSocketTransportConnection } from './connection'
import { Message, SetupMessage, isConnectionMessage, AuthStateMessage } from './messages'

export interface DXLinkWebSocketConfig {
  readonly keepaliveInterval: number
  readonly keepaliveTimeout: number
  readonly acceptKeepaliveTimeout: number
  readonly actionTimeout: number
}

export const PROTOCOL_VERSION = '0.1'

const NOT_CONNECTED_STATE: DXLinkConnectionState = {
  status: DXLinkConnectionStatus.NOT_CONNECTED,
  protocolVersion: PROTOCOL_VERSION,
  clientVersion: '0.0.0',
}

export class DXLinkWebSocket implements DXLinkWebSocketClient {
  private readonly config: DXLinkWebSocketConfig
  private connection: WebSocketTransportConnection | undefined

  private connectionState: DXLinkConnectionState
  private authState: DXLinkAuthState = DXLinkAuthState.UNAUTHORIZED

  private readonly connectionStateChangeListeners = new Set<DXLinkConnectionStateChangeListener>()
  private readonly errorListeners = new Set<DXLinkErrorListener>()
  private readonly authStateChangeListeners = new Set<DXLinkAuthStateChangeListener>()

  private timeoutIds: Record<string, any> = {}

  private lastSettedAuthToken: string | undefined

  private lastReceivedMillis = 0
  private lastSentMillis = 0

  private onInitSetupMessage: ((message: SetupMessage) => void) | undefined
  private onInitAuthStateMessage: ((message: AuthStateMessage) => void) | undefined
  private onInitError: ((message: DXLinkError) => void) | undefined
  private onInitConnectionCancel: (() => void) | undefined

  private readonly channels = new Map<number, {}>()

  constructor(config?: Partial<DXLinkWebSocketConfig>) {
    this.config = {
      keepaliveInterval: 30,
      keepaliveTimeout: 60,
      acceptKeepaliveTimeout: 60,
      actionTimeout: 10,
      ...config,
    }
    this.connectionState = NOT_CONNECTED_STATE
  }

  connect = async (url: string): Promise<void> => {
    if (this.connectionState.status !== DXLinkConnectionStatus.NOT_CONNECTED) {
      this.disconnect()
    }

    this.setConnectionState({
      ...this.connectionState,
      status: DXLinkConnectionStatus.CONNECTING,
    })

    try {
      let connectionCanceled = false
      this.onInitConnectionCancel = () => {
        connectionCanceled = true
      }
      this.connection = await WebSocketTransport.connect(url, {
        processMessage: this.processMessage,
        processError: this.processTransportError,
        processClose: this.processTransportClose,
      }).then((connection) => {
        if (connectionCanceled) {
          connection.close()
          throw new Error('Connection canceled')
        }

        return connection
      })
      this.onInitConnectionCancel = undefined

      const setupMessage: SetupMessage = {
        type: 'SETUP',
        channel: 0,
        version: `${this.connectionState.protocolVersion}-${this.connectionState.clientVersion}`,
        keepaliveTimeout: this.config.keepaliveTimeout,
        acceptKeepaliveTimeout: this.config.acceptKeepaliveTimeout,
      }

      this.sendMessage(setupMessage)

      // Await for setup message from server
      const serverSetup = await new Promise<SetupMessage>((resolve, reject) => {
        this.onInitSetupMessage = resolve
        this.onInitError = (error: DXLinkError) => {
          reject(new Error(error.message))
        }
        this.onInitConnectionCancel = () => {
          reject(new Error('Connection canceled'))
        }

        this.timeoutIds['SETUP'] = setTimeout(
          () => reject(new Error('Timeout on setup message')),
          this.config.actionTimeout * 1000
        )
      })
      this.onInitSetupMessage = undefined
      this.onInitError = undefined
      this.onInitConnectionCancel = undefined
      this.clearTimeout('SETUP')

      // Await for first auth state from server
      await new Promise<AuthStateMessage>((resolve, reject) => {
        this.onInitAuthStateMessage = resolve
        this.onInitError = (error: DXLinkError) => {
          reject(new Error(error.message))
        }
        this.onInitConnectionCancel = () => {
          reject(new Error('Connection canceled'))
        }

        this.timeoutIds['AUTH_STATE'] = setTimeout(
          () => reject(new Error('Timeout on auth state')),
          this.config.actionTimeout * 1000
        )
      })
      this.onInitAuthStateMessage = undefined
      this.onInitError = undefined
      this.onInitConnectionCancel = undefined
      this.clearTimeout('AUTH_STATE')

      // Send auth message if token was setted before connection was established
      if (this.lastSettedAuthToken !== undefined) {
        this.sendAuthMessage(this.lastSettedAuthToken)

        // Await for auth state from server
        await new Promise<void>((resolve, reject) => {
          this.onInitAuthStateMessage = (message) => {
            if (message.state === 'AUTHORIZED') {
              return resolve()
            }

            reject(new Error('Authorization failed'))
          }
          // Reject promise if 'UNAUTHORIZED' error received
          this.onInitError = (error: DXLinkError) => {
            if (error.type === 'UNAUTHORIZED') {
              reject(new Error(error.message))
            }
          }
          this.onInitConnectionCancel = () => {
            reject(new Error('Connection canceled'))
          }
          // Throw error if auth state is not received in time
          this.timeoutIds['AUTH_STATE'] = setTimeout(
            () => reject(new Error('Timeout on auth state')),
            this.config.actionTimeout * 1000
          )
        })
        this.onInitAuthStateMessage = undefined
        this.onInitError = undefined
        this.onInitConnectionCancel = undefined
        this.clearTimeout('AUTH_STATE')
      }

      this.setConnectionState({
        ...this.connectionState,
        status: DXLinkConnectionStatus.CONNECTED,
        serverVersion: serverSetup.version,
        clientKeepaliveTimeout: setupMessage.keepaliveTimeout,
        serverKeepaliveTimeout: serverSetup.keepaliveTimeout,
      })
    } catch (error) {
      this.disconnect()

      throw error
    } finally {
      // Clear all at the end
      this.onInitSetupMessage = undefined
      this.onInitAuthStateMessage = undefined
      this.onInitConnectionCancel = undefined
      this.onInitError = undefined
      this.clearTimeout('SETUP')
      this.clearTimeout('AUTH_STATE')
    }
  }

  disconnect = () => {
    console.debug('Disconnecting...')

    // Cancel connection if it is not established yet
    if (this.onInitConnectionCancel) {
      return this.onInitConnectionCancel()
    }

    this.connection?.close()
  }

  getConnectionState = () => this.connectionState

  addConnectionStateChangeListener = (listener: DXLinkConnectionStateChangeListener) =>
    this.connectionStateChangeListeners.add(listener)
  removeConnectionStateChangeListener = (listener: DXLinkConnectionStateChangeListener) =>
    this.connectionStateChangeListeners.delete(listener)

  setAuthToken = (token: string): void => {
    console.debug('Setting auth token', token)
    this.lastSettedAuthToken = token

    if (this.connectionState.status === DXLinkConnectionStatus.CONNECTED) {
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
    parameters?: Record<string, unknown> | undefined
  ): Promise<DXLinkChannel> => {
    throw new Error('Method not implemented.')
  }

  close = (): void => {
    console.debug('Closing...')

    this.reset()

    // TODO: mb remove CLOSED state
    this.setConnectionState({
      ...NOT_CONNECTED_STATE,
      status: DXLinkConnectionStatus.CLOSED,
    })
  }

  private reset = (): void => {
    console.debug('Resetting...')
    this.connection = undefined

    this.onInitSetupMessage = undefined
    this.onInitAuthStateMessage = undefined
    this.onInitConnectionCancel = undefined
    this.onInitError = undefined

    for (const key of Object.keys(this.timeoutIds)) {
      this.clearTimeout(key)
    }

    this.connectionStateChangeListeners.clear()
    this.errorListeners.clear()
    this.authStateChangeListeners.clear()
    // TODO: reset channels
    this.channels.clear()
  }

  private setConnectionState = (state: DXLinkConnectionState) => {
    console.debug('Connection state', state)
    const prev = this.connectionState
    this.connectionState = state
    for (const listener of this.connectionStateChangeListeners) {
      listener(state, prev)
    }
  }

  private sendMessage = (message: Message): void => {
    console.debug('Send message', message)
    if (!this.connection) throw new Error('Connection is not established.')

    this.connection.send(message)

    this.scheduleKeepalive()

    this.lastSentMillis = Date.now()
  }

  private sendAuthMessage = (token: string): void => {
    this.setAuthState(DXLinkAuthState.AUTHORIZING)

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
      listener(state, prev)
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
          return this.processError({
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
    if (this.onInitSetupMessage) {
      this.onInitSetupMessage(serverSetup)
    }

    // Setup keepalive timeout check
    const timeoutMills = (serverSetup.keepaliveTimeout ?? 60) * 1000
    this.timeoutIds['TIMEOUT'] = setTimeout(() => this.timeoutCheck(timeoutMills), timeoutMills)
  }

  private processError = (error: DXLinkError): void => {
    console.debug('Error', error)
    if (this.onInitError) {
      return this.onInitError(error)
    }

    if (this.errorListeners.size === 0) {
      console.error('Unhandled error', error)
      return
    }

    for (const listener of this.errorListeners) {
      listener(error)
    }
  }

  private processAuthStateMessage = (message: AuthStateMessage): void => {
    console.debug('Auth state', message)
    if (this.onInitAuthStateMessage) {
      this.onInitAuthStateMessage(message)
    }

    if (this.connectionState.status === DXLinkConnectionStatus.CONNECTED) {
      // Reset auth token if server rejected it
      if (message.state === 'UNAUTHORIZED') {
        this.lastSettedAuthToken = undefined
      }
    }

    this.setAuthState(DXLinkAuthState[message.state])
  }

  private processTransportError = (error: Error): void => {
    console.debug('Transport error', error)

    this.processError({
      type: 'UNKNOWN',
      message: error.message,
    })
  }

  private processTransportClose = (): void => {
    console.debug('Connection closed')

    this.reset()

    this.setConnectionState(NOT_CONNECTED_STATE)
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

      return this.close()
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
