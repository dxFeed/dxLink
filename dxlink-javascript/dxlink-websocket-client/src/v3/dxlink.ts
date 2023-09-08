import { Closable } from './common'
import { ErrorType } from './messages'

export interface DXLinkError {
  type: ErrorType
  message: string
}

export enum DXLinkConnectionStatus {
  /**
   * Client was created and not connected to remote endpoint.
   */
  NOT_CONNECTED = 'NOT_CONNECTED',
  /**
   * The {@link DXLinkWebSocketClient.connect} method was called to establish connection, but connection is not actually established yet.
   */
  CONNECTING = 'CONNECTING',
  /**
   * The connection to remote endpoint is established.
   */
  CONNECTED = 'CONNECTED',
  /**
   * Endpoint was closed by {@link DXLinkWebSocketClient.close} and cannot be used anymore.
   */
  CLOSED = 'CLOSED',
}

export interface DXLinkConnectionState {
  status: DXLinkConnectionStatus
  protocolVersion: string
  clientVersion: string
  serverVersion: string
  clientKeepaliveTimeout: number
  serverKeepaliveTimeout: number
}

export type DXLinkConnectionStateChangeListener = (
  prev: DXLinkConnectionStatus,
  state: DXLinkConnectionStatus
) => void

export enum DXLinkAuthState {
  /**
   * User is unauthorized on the remote endpoint or
   */
  UNAUTHORIZED = 'UNAUTHORIZED',
  /**
   *
   */
  AUTHROIZED = 'AUTHROIZED',
}

export type DXLinkAuthStateChangeListener = (state: DXLinkAuthState) => void

export interface DXLinkChannelMessage {
  readonly type: string
  readonly [key: string]: unknown
}

export type DXLinkChannelMessageListener = (message: DXLinkChannelMessage) => void

export type DXLinkChannelStatusListener = (status: DXLinkChannelStatus) => void

export type DXLinkErrorListener = (error: DXLinkError) => void

/**
 * Channel status that can be used to check if channel is available for sending messages.
 */
export enum DXLinkChannelStatus {
  /**
   * Channel is opened and can be used to {@link DXLinkChannel.send} messages.
   */
  OPENED = 'OPENED',
  /**
   * Channel was closed by {@link DXLinkChannel.close} or by server.
   * Channel cannot be used anymore.
   */
  CLOSED = 'CLOSED',
}

/**
 * Isolated channel to service withing single {@link DXLinkWebSocketClient} connection to remote endpoint.
 */
export interface DXLinkChannel extends Closable {
  readonly id: number
  readonly service: string
  readonly parameters: Record<string, unknown>

  send(message: DXLinkChannelMessage): void

  addMessageListener(listener: DXLinkChannelMessageListener): void
  removeMessageListener(listener: DXLinkChannelMessageListener): void

  getStatus(): DXLinkChannelStatus
  addStatusListener(listener: DXLinkChannelStatusListener): void
  removeStatusListener(listener: DXLinkChannelStatusListener): void

  addErrorListener(listener: DXLinkErrorListener): void
  removeErrorListener(listener: DXLinkErrorListener): void

  /**
   * Send an error to the channel.
   */
  error(error: DXLinkError): void
}

export interface DXLinkWebSocketClient extends Closable {
  connect(): Promise<void>
  disconnect(): void

  getConnectionState(): DXLinkConnectionState
  addConnectionStateChangeListener(listener: DXLinkConnectionStateChangeListener): void
  removeConnectionStateChangeListener(listener: DXLinkConnectionStateChangeListener): void

  setAuthToken(token: string): void
  getAuthState(): DXLinkAuthState
  addAuthStateChangeListener(listener: DXLinkAuthStateChangeListener): void
  removeAuthStateChangeListener(listener: DXLinkAuthStateChangeListener): void

  addErrorListener(listener: DXLinkErrorListener): void
  removeErrorListener(listener: DXLinkErrorListener): void

  openChannel(service: string, parameters?: Record<string, unknown>): Promise<DXLinkChannel>
}
