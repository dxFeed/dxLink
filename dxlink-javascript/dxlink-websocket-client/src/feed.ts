import { filter, map, Observable, scan, shareReplay, withLatestFrom } from 'rxjs'
import { Channel, OpenChannel } from './channel'
import { Message } from './protocol'

export type FeedContract = 'AUTO' | 'TICKER' | 'HISTORY' | 'STREAM'

export type FeedDataFormat = 'FULL' | 'COMPACT'

export interface FeedParameters {
  contract: FeedContract
  subFormat?: 'LIST'
}

export interface EventFields {
  [eventType: string]: string[]
}

export interface FeedSetupMessage extends Message {
  type: 'FEED_SETUP'
  acceptAggregationPeriod?: number
  acceptDataFormat?: FeedDataFormat
  acceptEventFields?: EventFields
}

export interface FeedConfigMessage extends Message {
  type: 'FEED_CONFIG'
  aggregationPeriod: number
  dataFormat: FeedDataFormat
  eventFields?: EventFields
}

export interface RegularSubscription {
  type: string
  symbol: string
}

export interface TimeSeriesSubscription extends RegularSubscription {
  fromTime: number
}

export interface OrderBookSubscription extends RegularSubscription {
  source: string
}

export interface FeedSubscriptionMessage extends Message {
  type: 'FEED_SUBSCRIPTION'
  add?: (RegularSubscription | TimeSeriesSubscription | OrderBookSubscription)[]
  remove?: (RegularSubscription | TimeSeriesSubscription | OrderBookSubscription)[]
  reset?: boolean
}

export type EventValue = number | string | boolean

export interface EventData {
  [key: string]: EventValue
}

export type CompactEventData = [string, EventValue[]]

export interface FeedDataMessage extends Message {
  type: 'FEED_DATA'
  data: EventData[] | CompactEventData
}

export const isFeedFullData = (data: EventData[] | CompactEventData): data is EventData[] =>
  typeof data[0] === 'object'

export const isFeedCompactData = (data: EventData[] | CompactEventData): data is CompactEventData =>
  data.length >= 2 && typeof data[0] === 'string' && Array.isArray(data[1])

export interface SubscriptionAction<S> {
  add?: S[]
  remove?: S[]
  reset?: boolean
}

export interface SetupAction {
  acceptAggregationPeriod?: number
  acceptDataFormat?: FeedDataFormat
  acceptEventFields?: EventFields
}

interface GenericFeedChannel<S extends RegularSubscription> {
  id: number
  service: 'FEED'
  contract: FeedContract

  state: Channel['state']
  error: Channel['error']
  data: Observable<EventData[]>
  config: Observable<FeedConfigMessage>

  setup: (action: SetupAction) => void
  subscription: (action: SubscriptionAction<S>) => void
  close: () => Promise<void>
}

export interface TickerChannel extends GenericFeedChannel<RegularSubscription> {
  contract: 'TICKER'
}

export interface HistoryChannel
  extends GenericFeedChannel<TimeSeriesSubscription | OrderBookSubscription> {
  contract: 'HISTORY'
}

export interface StreamChannel extends GenericFeedChannel<RegularSubscription> {
  contract: 'STREAM'
}

export interface AutoChannel
  extends GenericFeedChannel<RegularSubscription | TimeSeriesSubscription | OrderBookSubscription> {
  contract: 'AUTO'
}

export type FeedChannelByContract<Contract extends FeedContract> = {
  STREAM: StreamChannel
  TICKER: TickerChannel
  HISTORY: HistoryChannel
  AUTO: AutoChannel
}[Contract]

export type FeedChannel = TickerChannel | HistoryChannel | StreamChannel | AutoChannel

export const feedChannel = async <Contract extends FeedContract = 'AUTO'>(
  openChannel: OpenChannel,
  contract?: Contract
) => {
  const channelContract = contract ?? 'AUTO'
  const channel = await openChannel('FEED', { contract: channelContract })

  const channelConfig = channel.message.pipe(
    filter((message): message is FeedConfigMessage => message.type === 'FEED_CONFIG'),
    scan((acc, value) => ({
      ...acc,
      ...value,
      eventFields: {
        ...(acc.eventFields ?? {}),
        ...(value.eventFields ?? {}),
      },
    })),
    shareReplay(1)
  )

  const channelData = channel.message.pipe(
    filter((message): message is FeedDataMessage => message.type === 'FEED_DATA'),
    map((message) => message.data),
    withLatestFrom(channelConfig),
    map(([data, config]) => {
      if (config.dataFormat === 'FULL') {
        if (isFeedFullData(data)) {
          return data
        }
      }

      if (isFeedCompactData(data)) {
        const events: EventData[] = []

        const [eventType, values] = data
        const eventFields = config.eventFields?.[eventType]
        if (eventFields === undefined) {
          throw new Error('Cannot decode event: unknown event type')
        }

        let cursor = 0
        while (cursor < values.length) {
          const event: Record<string, EventValue> = {
            eventType,
          }
          for (const field of eventFields) {
            const value = values[cursor]
            if (value === undefined) {
              throw new Error('Cannot decode event: not enough values')
            }
            event[field] = value
            cursor++
          }
          events.push(event)
        }

        return events
      }

      throw new Error('Invalid data format')
    })
  )

  const setup = (action: SetupAction) => {
    channel.send({
      type: 'FEED_SETUP',
      acceptAggregationPeriod: action.acceptAggregationPeriod,
      acceptDataFormat: action.acceptDataFormat,
      acceptEventFields: action.acceptEventFields,
    })
  }

  const subscription = (action: SubscriptionAction<RegularSubscription>) => {
    channel.send({
      type: 'FEED_SUBSCRIPTION',
      add: action.add,
      remove: action.remove,
      reset: action.reset,
    })
  }

  const feedChannel: FeedChannel = {
    id: channel.id,
    service: 'FEED',
    state: channel.state,
    error: channel.error,
    contract: channelContract,
    data: channelData,
    config: channelConfig,

    subscription,
    setup,
    close: channel.close,
  }

  // Cast to the correct type
  return feedChannel as FeedChannelByContract<Contract>
}
