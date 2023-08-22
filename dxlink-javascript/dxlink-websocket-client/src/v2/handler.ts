import { AuthState } from 'src/protocol'
import {
  ChannelLifecycleMessage,
  ChannelPayloadMessage,
  ConnectionMessage,
  Message,
} from './messages'

export interface ConnectionMessageHandler {
  handleMessage(message: ConnectionMessage): void

  handleClose(): void
}

export interface ChannelMessageHandler {
  handleLifecycle(message: ChannelLifecycleMessage): void

  handleChannelPayload(message: ChannelPayloadMessage): void

  handleClose(): void
}

export interface TransportHandler {
  handleMessage(message: Message): void

  handleError(error: Error): void

  handleClose(): void
}

export interface AuthHandler {
  handleAuthState(state: AuthState): void

  handleClose(): void
}
