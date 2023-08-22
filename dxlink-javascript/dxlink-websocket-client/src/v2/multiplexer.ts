import { ChannelMessageHandler, ConnectionMessageHandler, TransportHandler } from './handler'
import {
  Message,
  isChannelLifecycleMessage,
  isChannelPayloadMessage,
  isConnectionMessage,
} from './messages'
import { TransportConnection } from './transport'

export class Multiplexer implements TransportHandler {
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
