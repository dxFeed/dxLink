import type { DXLinkChannelMessage } from '@dxfeed/dxlink-core'

export enum DepthOfMarketDataFormat {
  'FULL' = 'FULL',
}

export interface DepthOfMarketParameters {
  readonly symbol: string
  readonly sources: string[]
}

export interface DepthOfMarketSetupMessage {
  readonly type: 'DOM_SETUP'
  readonly acceptAggregationPeriod?: number
  readonly acceptDepthLimit?: number
  readonly acceptDataFormat?: DepthOfMarketDataFormat
  readonly acceptOrderFields?: string[]
}

export interface DepthOfMarketConfigMessage {
  readonly type: 'DOM_CONFIG'
  readonly aggregationPeriod: number
  readonly depthLimit: number
  readonly dataFormat: DepthOfMarketDataFormat
  readonly orderFields: string[]
}

export interface DepthOfMarketOrder {
  price: number
  size: number
}

export interface DepthOfMarketSnapshotMessage {
  readonly type: 'DOM_SNAPSHOT'
  readonly time: number
  readonly bids: DepthOfMarketOrder[]
  readonly asks: DepthOfMarketOrder[]
}

export type DepthOfMarketMessage =
  | DepthOfMarketSetupMessage
  | DepthOfMarketConfigMessage
  | DepthOfMarketSnapshotMessage

export const isDepthOfMarketMessage = (
  message: DXLinkChannelMessage
): message is DepthOfMarketMessage =>
  message.type === 'DOM_SETUP' || message.type === 'DOM_CONFIG' || message.type === 'DOM_SNAPSHOT'
