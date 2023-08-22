import { AuthManager } from './auth'
import { ConnectionLifecycleHandler } from './core'
import { ConnectionMessageHandler } from './handler'
import { KeepaliveManager } from './keepalive'
import { ConnectionMessage, ErrorMessage, SetupMessage } from './messages'
import { TransportConnection } from './transport'

export class ConnectionManager implements ConnectionMessageHandler {
  private serverSetupHandler: ((message: SetupMessage) => void) | undefined
  private timeoutId: any

  private serverSetupMessage: SetupMessage | undefined

  private lastError: ErrorMessage | undefined

  private handlers = new Set<ConnectionLifecycleHandler>()

  constructor(
    private readonly connection: TransportConnection,
    private readonly keepaliveManager: KeepaliveManager,
    private readonly authManager: AuthManager
  ) {
    this.authManager.addHandler((state) => {
      for (const handler of this.handlers) {
        handler.handleAuthState(state)
      }
    })
  }

  handleMessage = (message: ConnectionMessage) => {
    this.keepaliveManager.handle(message)

    switch (message.type) {
      case 'SETUP': {
        this.serverSetupMessage = message

        if (message.keepaliveTimeout !== undefined) {
          this.keepaliveManager.setKeepaliveTimeout(message.keepaliveTimeout)
        }

        if (this.serverSetupHandler !== undefined) {
          this.serverSetupHandler(message)
        }
        break
      }
      case 'ERROR': {
        this.lastError = message

        if (this.handlers.size === 0) {
          console.error('Unhandled error', message)
          break
        }

        for (const handler of this.handlers) {
          handler.handleError({
            type: message.error,
            message: message.message,
          })
        }
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

  handleClose = () => {
    this.keepaliveManager.handleClose()
    this.authManager.handleClose()

    for (const handler of this.handlers) {
      handler.handleClose()
    }

    this.handlers.clear()

    if (this.timeoutId !== undefined) {
      clearTimeout(this.timeoutId)
    }
  }

  whenReady = (timeout: number): Promise<SetupMessage> => {
    return new Promise((resolve, reject) => {
      this.serverSetupHandler = (setupMessage) => {
        this.serverSetupHandler = undefined

        resolve(setupMessage)
      }

      this.timeoutId = setTimeout(() => {
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
