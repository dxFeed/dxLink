import type { DXLinkErrorListener } from './error'

/**
 * Message that can be sent to or received from the channel.
 * @see {DXLinkChannel.send} and {@link DXLinkChannel.addMessageListener}
 */
export interface DXLinkChannelMessage {
  /**
   * Type of the message.
   */
  readonly type: string
  /**
   * Payload of the message.
   */
  readonly [key: string]: any // eslint-disable-line @typescript-eslint/no-explicit-any
}
/**
 * Listener for messages from the channel.
 * @see {DXLinkChannel.addMessageListener}
 */
export type DXLinkChannelMessageListener = (message: DXLinkChannelMessage) => void

/**
 * Listener for channel state changes.
 * @see {DXLinkChannel.addStateChangeListener}
 */
export type DXLinkChannelStateChangeListener = (
  state: DXLinkChannelState,
  prev: DXLinkChannelState
) => void

/**
 * Channel state that can be used to check if channel is available for sending messages.
 * @see {DXLinkChannel.getState}
 */
export enum DXLinkChannelState {
  /**
   * Channel is requested and cannot be used to {@link DXLinkChannel.send} messages yet.
   */
  REQUESTED = 'REQUESTED',
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
 * @see DXLinkWebSocketClient.openChannel
 */
export interface DXLinkChannel {
  /**
   * Unique identifier of the channel.
   */
  readonly id: number
  /**
   * Name of the service that channel is opened to.
   */
  readonly service: string
  /**
   * Parameters of the service that channel is opened to.
   */
  readonly parameters: Record<string, unknown>

  /**
   * Send a message to the channel.
   */
  send(message: DXLinkChannelMessage): void

  /**
   * Add a listener for messages from the channel.
   */
  addMessageListener(listener: DXLinkChannelMessageListener): void
  /**
   * Remove a listener for messages from the channel.
   */
  removeMessageListener(listener: DXLinkChannelMessageListener): void

  /**
   * Get channel state that can be used to check if channel is available for sending messages.
   */
  getState(): DXLinkChannelState
  /**
   * Add a listener for channel state changes.
   * If channel is ready to use, listener will be called immediately with {@link DXLinkChannelState.OPENED} state.
   * @see {DXLinkChannelState}
   * Note: when remote endpoint reconnects, channel will be reopened and listener will be called with {@link DXLinkChannelState.OPENED} state again.
   * @see {DXLinkWebSocketClient.getConnectionState}
   */
  addStateChangeListener(listener: DXLinkChannelStateChangeListener): void
  /**
   * Remove a listener for channel state changes.
   */
  removeStateChangeListener(listener: DXLinkChannelStateChangeListener): void

  /**
   * Add a listener for errors from the server.
   * @see {DXLinkError}
   */
  addErrorListener(listener: DXLinkErrorListener): void
  /**
   * Remove a listener for errors from the server.
   * @see {DXLinkError}
   */
  removeErrorListener(listener: DXLinkErrorListener): void

  /**
   * Close the channel and free all resources.
   * This method does nothing if the channel is already closed.
   * The channel {@see DXLinkChannel.getStatus} immediately becomes {@link State#CLOSED CLOSED}.
   * @see {DXLinkChannelState}
   */
  close(): void
}
