export interface AuthMessage {
  type: 'AUTH'
  channel: 0
  token: string
}

export type AuthState = 'AUTHORIZED' | 'UNAUTHORIZED'

export interface AuthStateMessage {
  type: 'AUTH_STATE'
  channel: 0
  state: AuthState
}

export interface SetupMessage {
  type: 'SETUP'
  channel: 0
  version: string
  keepaliveTimeout?: number
  acceptKeepaliveTimeout?: number
}

export interface KeepaliveMessage {
  type: 'KEEPALIVE'
  channel: 0
}

export interface ChannelRequestMessage {
  type: 'CHANNEL_REQUEST'
  channel: number
  service: string
  parameters?: Record<string, unknown>
}

export interface ChannelCancelMessage {
  type: 'CHANNEL_CANCEL'
  channel: number
}

export interface ChannelOpenedMessage {
  type: 'CHANNEL_OPENED'
  channel: number
  service: string
  parameters?: Record<string, unknown>
}

export interface ChannelClosedMessage {
  type: 'CHANNEL_CLOSED'
  channel: number
}

export type ErrorType =
  | 'UNKNOWN'
  | 'UNSUPPORTED_PROTOCOL'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'INVALID_MESSAGE'
  | 'BAD_ACTION'

export interface ErrorMessage {
  type: 'ERROR'
  channel: 0
  error: ErrorType
  message: string
}

export interface ChannelErrorMessage {
  type: 'ERROR'
  channel: number
  error: ErrorType
  message: string
}

export interface ChannelPayloadMessage {
  type: string
  channel: number
  [key: string]: unknown
}

export type ConnectionMessage =
  | SetupMessage
  | KeepaliveMessage
  | AuthMessage
  | AuthStateMessage
  | ErrorMessage

export type DXLinkWebSocketMessage =
  | SetupMessage
  | KeepaliveMessage
  | AuthMessage
  | AuthStateMessage
  | ErrorMessage
  | ChannelRequestMessage
  | ChannelCancelMessage
  | ChannelOpenedMessage
  | ChannelClosedMessage
  | ChannelPayloadMessage
  | ChannelErrorMessage

export const isConnectionMessage = (
  message: DXLinkWebSocketMessage
): message is ConnectionMessage =>
  message.channel === 0 &&
  (message.type === 'SETUP' ||
    message.type === 'KEEPALIVE' ||
    message.type === 'AUTH' ||
    message.type === 'AUTH_STATE' ||
    message.type === 'ERROR')

export type ChannelLifecycleMessage =
  | ChannelOpenedMessage
  | ChannelClosedMessage
  | ChannelErrorMessage
  | ChannelRequestMessage
  | ChannelCancelMessage

export type ChannelMessage = ChannelLifecycleMessage | ChannelPayloadMessage

export const isChannelMessage = (message: DXLinkWebSocketMessage): message is ChannelMessage =>
  message.channel !== 0

export const isChannelLifecycleMessage = (
  message: ChannelMessage
): message is ChannelLifecycleMessage =>
  message.type === 'CHANNEL_OPENED' ||
  message.type === 'CHANNEL_CLOSED' ||
  message.type === 'ERROR' ||
  message.type === 'CHANNEL_REQUEST' ||
  message.type === 'CHANNEL_CANCEL'
