import { Message } from './messages'
import { TransportConnection } from './transport'

export class KeepaliveManager {
  private lastReceivedMillis: number = Date.now()
  private lastSentMillis: number = Date.now()
  private timeoutId: any

  constructor(
    private readonly connection: TransportConnection,
    private readonly keepaliveInterval: number,
    private keepaliveTimeout: number
  ) {
    this.timeoutId = setTimeout(() => this.timeoutCheck(), this.keepaliveTimeout * 1000)
  }

  handle(_message: Message): void {
    this.lastReceivedMillis = Date.now()
    if (this.lastReceivedMillis - this.lastSentMillis >= this.keepaliveInterval * 1000) {
      this.connection.send({
        type: 'KEEPALIVE',
        channel: 0,
      })
    }
  }

  setKeepaliveTimeout(keepaliveTimeout: number) {
    this.keepaliveTimeout = keepaliveTimeout
  }

  private timeoutCheck() {
    const now = Date.now()
    const noKeepaliveDuration = now - this.lastReceivedMillis
    if (noKeepaliveDuration >= this.keepaliveTimeout * 1000) {
      this.connection.send({
        type: 'ERROR',
        channel: 0,
        error: 'TIMEOUT',
        message: 'No keepalive received for ' + noKeepaliveDuration + 'ms',
      })
      this.connection.close()
    }

    const nextTimeout = Math.max(200, this.keepaliveTimeout * 1000 - noKeepaliveDuration)
    this.timeoutId = setTimeout(() => this.timeoutCheck(), nextTimeout)
  }

  handleClose() {
    if (this.timeoutId !== undefined) {
      clearTimeout(this.timeoutId)
    }
  }
}
