import { ChannelMessage, Message } from "./v2/messages";
import { ConnectionMessage } from "./protocol";

export interface MessageHandler {
  handle(message: Message): void
}

export interface ConnectionHandler {
  handle(message: ConnectionMessage): void
}

export interface ChannelHandler {
  handleOpen(): void
  handleClose(): void
  handleMessage(message: ChannelMessage): void
}

export interface ChannelLifecycleHandler {
  handle(message: ChannelMessage | ): void
}

export class DXLinkMessageHandler implements MessageHandler {
  channels: {
    [key: number]: ChannelHandler
  } = {}

  handle(message: Message): void {

  }

  connectHandler(channelId: number, handler: ChannelHandler): void {
    this.channels[channelId] = handler
  }

  disconnectHandler(channelId: number): void {
    delete this.channels[channelId]
  }
}
