import { type DXLinkChannelMessage } from '@dxfeed/dxlink-websocket-client'

export enum FeedContract {
  'TICKER' = 'TICKER',
  'HISTORY' = 'HISTORY',
  'STREAM' = 'STREAM',
  'AUTO' = 'AUTO',
}

export enum FeedDataFormat {
  'FULL' = 'FULL',
  'COMPACT' = 'COMPACT',
}

export interface FeedParameters {
  readonly contract: FeedContract
}

export interface FeedEventFields {
  [eventType: string]: string[]
}

export interface FeedSetupMessage {
  readonly type: 'FEED_SETUP'
  readonly acceptAggregationPeriod?: number
  readonly acceptDataFormat?: FeedDataFormat
  readonly acceptEventFields?: FeedEventFields
}

export interface FeedConfigMessage {
  readonly type: 'FEED_CONFIG'
  readonly aggregationPeriod: number
  readonly dataFormat: FeedDataFormat
  readonly eventFields?: FeedEventFields
}

export type Subscription = {
  readonly type: string
  readonly symbol: string
}

export type TimeSeriesSubscription = {
  readonly type: string
  readonly symbol: string
  readonly fromTime: number
}

export type IndexedEventSubscription = {
  readonly type: string
  readonly symbol: string
  readonly source: string
}

export interface FeedSubscriptionMessage {
  readonly type: 'FEED_SUBSCRIPTION'
  readonly add?: (Subscription | TimeSeriesSubscription | IndexedEventSubscription)[]
  readonly remove?: (Subscription | TimeSeriesSubscription | IndexedEventSubscription)[]
  readonly reset?: boolean
}

export type FeedEventValue = number | string | boolean

export interface FeedEventData {
  [key: string]: FeedEventValue
}

export type FeedCompactEventData = [string, FeedEventValue[]]

export interface FeedDataMessage {
  readonly type: 'FEED_DATA'
  readonly data: FeedEventData[] | FeedCompactEventData
}

export type FeedMessage =
  | FeedSetupMessage
  | FeedConfigMessage
  | FeedSubscriptionMessage
  | FeedDataMessage

export const isFeedFullData = (
  data: FeedEventData[] | FeedCompactEventData
): data is FeedEventData[] => typeof data[0] === 'object'

export const isFeedCompactData = (
  data: FeedEventData[] | FeedCompactEventData
): data is FeedCompactEventData =>
  data.length >= 2 && typeof data[0] === 'string' && Array.isArray(data[1])

export const isFeedMessage = (message: DXLinkChannelMessage): message is FeedMessage =>
  message.type === 'FEED_SETUP' ||
  message.type === 'FEED_CONFIG' ||
  message.type === 'FEED_SUBSCRIPTION' ||
  message.type === 'FEED_DATA'
