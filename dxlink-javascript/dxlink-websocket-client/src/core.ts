import { ChannelPayloadMessage } from './v2/messages'

interface DXLinkError {
  type: ErrorType
  message: string
}

interface MessageHandler<Message> {
  handle(message: Message): void
}

interface Channel {
  readonly service: string
  readonly parameters: Record<string, unknown>

  handleOpened(): void
  handleClosed(): void
}

export interface DXLinkChannel {
  send(message: ChannelPayloadMessage): void

  inbound(handler: Message)
}

export interface DXLink {
  openChannel(service: string, parameters: Record<string, unknown>): Promise<DXLinkChannel>
}
