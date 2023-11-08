/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  FeedContract,
  FeedDataFormat,
  DXLinkWebSocketClientImpl,
  DXLinkFeedImpl,
  type Subscription,
  type TimeSeriesSubscription,
} from '../src'

async function start() {
  console.log('Start')

  const client = new DXLinkWebSocketClientImpl({
    logLevel: 0,
  })

  client.connect('wss://demo.dxfeed.com/dxlink-ws')

  const feed = new DXLinkFeedImpl(client, FeedContract.TICKER)

  feed.addEventListener((events) => {
    console.log('Events', events)
  })

  feed.configure({
    acceptAggregationPeriod: 10,
    acceptDataFormat: FeedDataFormat.COMPACT,
    acceptEventFields: {
      Quote: ['eventSymbol', 'askPrice', 'bidPrice'],
      Candle: ['eventSymbol', 'open', 'close', 'high', 'low', 'volume'],
    },
  })

  const sub1: Subscription = { type: 'Quote', symbol: 'ETH/USD:GDAX' } as const
  const sub2: TimeSeriesSubscription = {
    type: 'Candle',
    symbol: 'ETH/USD:GDAX{=d}',
    fromTime: 0,
  } as const

  feed.addSubscriptions(sub2, sub1)

  setTimeout(() => {
    feed.addSubscriptions(sub2)
    feed.removeSubscriptions(sub1)

    setTimeout(() => {
      feed.clearSubscriptions()
    }, 3000)
  }, 3000)
}

async function start2() {
  const client = new DXLinkWebSocketClientImpl({
    logLevel: 0,
  })

  client.connect('wss://demo.dxfeed.com/dxlink-ws')

  const feed = new DXLinkFeedImpl(client, FeedContract.TICKER)

  feed.addEventListener((events) => {
    console.log('Events', events)
  })

  feed.configure({
    acceptAggregationPeriod: 0,
    acceptDataFormat: FeedDataFormat.COMPACT,
    acceptEventFields: {
      Quote: ['eventSymbol', 'askPrice', 'bidPrice'],
      Candle: ['eventSymbol', 'open', 'close', 'high', 'low', 'volume'],
    },
  })

  const subs = Array.from({ length: 200 }).map(
    (_, index) =>
      ({
        type: 'Candle',
        symbol: `${Array.from({ length: 10 }).join('A')}{=${index}d}`,
        fromTime: Date.now(),
      }) as const
  )

  feed.addSubscriptions(subs)
}

start().catch((error) => console.error('Start error', error))
