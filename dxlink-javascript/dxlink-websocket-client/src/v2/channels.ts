import {
  DXLinkChannelLifecycleHandler,
  DXLinkChannel,
  DXLinkChannelMessageHandler,
  DXLinkError,
} from './core'
import { ChannelMessageHandler } from './handler'
import { ChannelLifecycleMessage, ChannelPayloadMessage } from './messages'
import { TransportConnection } from './transport'

class DXLinkChannelImpl implements DXLinkChannel, ChannelMessageHandler {
  private lifecycleHandlers = new Set<DXLinkChannelLifecycleHandler>()
  private messageHandlers = new Set<DXLinkChannelMessageHandler>()

  private done: boolean = false

  constructor(
    private readonly connection: TransportConnection,
    readonly id: number,
    readonly service: string,
    readonly parameters: Record<string, unknown>
  ) {
    this.connection.send({
      type: 'CHANNEL_REQUEST',
      channel: id,
      service,
      parameters,
    })
  }

  handleLifecycle(message: ChannelLifecycleMessage): void {
    if (this.done) {
      return
    }

    if (message.type === 'CHANNEL_OPENED') {
      for (const handler of this.lifecycleHandlers) {
        handler.handleState('OPENED')
      }
    } else if (message.type === 'CHANNEL_CLOSED') {
      for (const handler of this.lifecycleHandlers) {
        handler.handleState('CLOSED')
      }
    }
  }
  handleChannelPayload(message: ChannelPayloadMessage): void {
    if (this.done) {
      return
    }

    for (const handler of this.messageHandlers) {
      handler(message)
    }
  }

  handleClose(): void {
    this.messageHandlers.clear()

    for (const handler of this.lifecycleHandlers) {
      handler.handleState('CLOSED')
    }
    this.lifecycleHandlers.clear()
  }

  addMessageHandler(handler: DXLinkChannelMessageHandler): void {
    this.messageHandlers.add(handler)
  }

  removeMessageHandler(handler: DXLinkChannelMessageHandler): void {
    this.messageHandlers.delete(handler)
  }

  addLifecycleHandler(handler: DXLinkChannelLifecycleHandler): void {
    this.lifecycleHandlers.add(handler)
  }

  removeLifecycleHandler(handler: DXLinkChannelLifecycleHandler): void {
    this.lifecycleHandlers.delete(handler)
  }

  available(): boolean {
    return !this.done
  }

  error(error: DXLinkError): void {
    this.connection.send({
      type: 'ERROR',
      channel: this.id,
      error: error.type,
      message: error.message,
    })
  }

  close(): void {
    this.connection.send({
      type: 'CHANNEL_CANCEL',
      channel: this.id,
    })

    this.done = true
  }

  send(message: ChannelPayloadMessage): void {
    const { type, channel, ...payload } = message
    this.connection.send({
      type,
      channel: this.id,
      ...payload,
    })
  }

  whenReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const handler: DXLinkChannelLifecycleHandler = {
        handleState: (state) => {
          this.removeLifecycleHandler(handler)
          if (state === 'OPENED') {
            resolve()
          } else {
            reject()
          }
        },
        handleError: (error) => {
          this.removeLifecycleHandler(handler)
          reject(error)
        },
      }

      this.addLifecycleHandler(handler)
    })
  }
}

export class ChannelManager implements ChannelMessageHandler {
  channels: Record<number, ChannelMessageHandler> = {}

  private nextChannelId = 1

  constructor(private readonly connection: TransportConnection) {}

  handleClose(): void {
    throw new Error('Method not implemented.')
  }

  handleLifecycle(message: ChannelLifecycleMessage) {
    const channel = this.channels[message.channel]
    if (channel === undefined) {
      console.warn('Received lifecycle message for unknown channel', message)
      return
    }

    channel.handleLifecycle(message)
  }

  handleChannelPayload(message: ChannelPayloadMessage) {
    const channel = this.channels[message.channel]
    if (channel === undefined) {
      console.warn('Received payload message for unknown channel', message)
      return
    }

    channel.handleChannelPayload(message)
  }

  openChannel = async (
    service: string,
    parameters?: Record<string, unknown>
  ): Promise<DXLinkChannel> => {
    const channelId = this.nextChannelId
    this.nextChannelId += 2

    const channel = new DXLinkChannelImpl(this.connection, channelId, service, parameters || {})

    this.channels[channelId] = channel

    await channel.whenReady()

    return channel
  }
}
