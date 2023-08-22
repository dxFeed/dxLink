import { AuthManager } from './auth'
import { ConnectionLifecycleHandler, DXLinkError } from './core'
import { ConnectionMessageHandler } from './handler'
import { KeepaliveManager } from './keepalive'
import { ConnectionMessage, ErrorMessage, SetupMessage } from './messages'
import { TransportConnection } from './transport'

export class ConnectionManager implements ConnectionMessageHandler {
  private serverSetupHandler: ((message: SetupMessage) => void) | undefined
  private timeoutId: any

  private lastError: DXLinkError | undefined

  private handlers = new Set<ConnectionLifecycleHandler>()

  constructor(
    private readonly connection: TransportConnection,
    private readonly keepaliveManager: KeepaliveManager,
    private readonly authManager: AuthManager
  ) {
    this.authManager.addHandler((state) => {
      for (const handler of this.handlers) {
        handler.handleAuthState?.(state)
      }
    })
  }

  handleMessage = (message: ConnectionMessage) => {
    this.keepaliveManager.handle(message)

    switch (message.type) {
      case 'SETUP': {
        if (message.keepaliveTimeout !== undefined) {
          this.keepaliveManager.setKeepaliveTimeout(message.keepaliveTimeout)
        }

        if (this.serverSetupHandler !== undefined) {
          this.serverSetupHandler(message)
        }
        break
      }
      case 'ERROR': {
        this.publishError({ type: message.error, message: message.message })
        break
      }
      case 'AUTH_STATE': {
        this.authManager.handleAuthState(message.state)
        break
      }
      default: {
        console.warn('Unhandeled message', message)
      }
    }
  }

  private publishError = (error: DXLinkError) => {
    this.lastError = error

    if (error.type === 'UNAUTHORIZED') {
      this.authManager.handleError(error.message)
      return
    }

    if (this.handlers.size === 0) {
      console.error('Unhandled error', error)
      return
    }

    for (const handler of this.handlers) {
      handler.handleError?.(error)
    }
  }

  handleError = (error: Error) => {
    this.publishError({
      type: 'UNKNOWN',
      message: error.message,
    })
  }

  handleClose = () => {
    this.keepaliveManager.handleClose()
    this.authManager.handleClose()

    for (const handler of this.handlers) {
      handler.handleClose?.()
    }

    this.handlers.clear()

    if (this.timeoutId !== undefined) {
      clearTimeout(this.timeoutId)
    }
  }

  whenReady = (timeout: number): Promise<SetupMessage> => {
    return new Promise((resolve, reject) => {
      const handler: ConnectionLifecycleHandler = {
        handleError: (error) => {
          resetHandlers()
          reject(new Error(`${error.type}: ${error.message}`))
        },
      }

      const resetHandlers = () => {
        this.serverSetupHandler = undefined
        this.handlers.delete(handler)
      }

      this.handlers.add(handler)

      this.serverSetupHandler = (setupMessage) => {
        resetHandlers()

        resolve(setupMessage)
      }

      this.timeoutId = setTimeout(() => {
        resetHandlers()
        reject(new Error('Timeout waiting for server setup message'))
      }, timeout)
    })
  }

  getLastErrorMessage = (): ErrorMessage | undefined => {
    return this.lastError
  }

  addLifecycleHandler = (handler: ConnectionLifecycleHandler) => {
    this.handlers.add(handler)
  }

  removeLifecycleHandler = (handler: ConnectionLifecycleHandler) => {
    this.handlers.delete(handler)
  }
}
