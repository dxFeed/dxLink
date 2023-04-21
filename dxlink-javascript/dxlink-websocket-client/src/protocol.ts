export interface Message {
  type: string
  channel: number
  [key: string]: unknown
}

export interface Subscription {
  type: string
  symbol: string
}

export interface AuthMessage extends Message {
  type: 'AUTH'
  token: string
}

export type AuthState = 'AUTHORIZED' | 'UNAUTHORIZED'

export interface AuthStateMessage extends Message {
  type: 'AUTH_STATE'
  state: AuthState
}

export interface SetupMessage extends Message {
  type: 'SETUP'
  channel: 0
  version: string
  keepaliveTimeout?: number
  acceptKeepaliveTimeout?: number
}

export interface KeepaliveMessage extends Message {
  type: 'KEEPALIVE'
  channel: 0
}

export interface ChannelRequestMessage extends Message {
  type: 'CHANNEL_REQUEST'
  service: string
  parameters: Record<string, unknown>
}

export interface ChannelCancelMessage extends Message {
  type: 'CHANNEL_CANCEL'
}

export interface ChannelOpenedMessage extends Message {
  type: 'CHANNEL_OPENED'
  service: string
  parameters: Record<string, unknown>
}

export interface ChannelClosedMessage extends Message {
  type: 'CHANNEL_CLOSED'
}

export type ErrorType =
  | 'UNKNOWN'
  | 'UNSUPPORTED_PROTOCOL'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'INVALID_MESSAGE'
  | 'BAD_ACTION'

export interface ErrorMessage extends Message {
  type: 'ERROR'
  error: ErrorType
  message: string
}

export type ConnectionMessage =
  | SetupMessage
  | KeepaliveMessage
  | AuthMessage
  | AuthStateMessage
  | ErrorMessage

export const isConnectionMessage = (message: Message): message is ConnectionMessage =>
  message.channel === 0 &&
  (message.type === 'SETUP' ||
    message.type === 'KEEPALIVE' ||
    message.type === 'AUTH' ||
    message.type === 'AUTH_STATE' ||
    message.type === 'ERROR')
