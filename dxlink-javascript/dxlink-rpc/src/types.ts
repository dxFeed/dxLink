import type { DXLinkChannelMessage } from '@dxfeed/dxlink-core'

export const CHANNEL_DATA_TYPE = 'CHANNEL_DATA'

/**
 * CHANNEL_DATA message used to exchange payloads within a channel.
 * @see dxLink WebSocket Transport 1.1 specification
 */
export interface ChannelDataMessage<T = unknown> {
  readonly type: typeof CHANNEL_DATA_TYPE
  readonly payload: T
}

/**
 * Type guard that checks if a channel message is a CHANNEL_DATA message.
 */
export const isChannelDataMessage = (
  message: DXLinkChannelMessage
): message is ChannelDataMessage => message.type === CHANNEL_DATA_TYPE
