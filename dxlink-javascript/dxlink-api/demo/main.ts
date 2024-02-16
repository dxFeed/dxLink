/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  FeedContract,
  FeedDataFormat,
  DXLinkWebSocketClient,
  DXLinkFeed,
  type Subscription,
  type TimeSeriesSubscription,
} from '../src'

async function start() {
  console.log('Start')

  const client = new DXLinkWebSocketClient()
  client.connect('wss://demo.dxfeed.com/dxlink-ws')

  const feed = new DXLinkFeed(client, FeedContract.TICKER)

  feed.addEventListener((events) => {
    // your buisness logic here
    console.log('Events', events)
  })

  feed.configure({
    acceptAggregationPeriod: 10,
    acceptDataFormat: FeedDataFormat.COMPACT,
    acceptEventFields: {
      Quote: ['eventSymbol', 'askPrice', 'bidPrice'],
    },
  })

  feed.addSubscriptions({ type: 'Quote', symbol: 'AAPL' })

  // setTimeout(() => {
  //   feed.addSubscriptions(sub2)
  //   feed.removeSubscriptions(sub1)

  //   setTimeout(() => {
  //     feed.clearSubscriptions()
  //   }, 3000)
  // }, 3000)
}

start()
