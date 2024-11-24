/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  FeedContract,
  FeedDataFormat,
  DXLinkWebSocketClient,
  DXLinkFeed,
  DXLinkDepthOfMarket,
  type Subscription,
  type TimeSeriesSubscription,
  DXLinkChart,
  type DXLinkChartIndicators,
} from '../src'

async function startFeed() {
  console.log('Start Feed')

  const client = new DXLinkWebSocketClient()
  client.connect('wss://demo.dxfeed.com/dxlink-ws')

  const feed = new DXLinkFeed(client, FeedContract.TICKER)

  feed.addEventListener((events) => {
    // your buisness logic here
    console.log('Feed Events', events)
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

async function startDepthOfMarket() {
  console.log('Start Dom')

  const client = new DXLinkWebSocketClient()
  client.connect('wss://demo.dxfeed.com/dxlink-ws-dom')

  const dom = new DXLinkDepthOfMarket(client, { symbol: 'AAPL', sources: ['ntv'] })

  dom.addSnapshotListener((time, bids, asks) => {
    // your buisness logic here
    console.log('Dom Snapshot', time, bids, asks)
  })

  dom.configure({
    acceptAggregationPeriod: 10,
    acceptDepthLimit: 5,
  })
}

async function startChart() {
  console.log('Start Chart')

  const client = new DXLinkWebSocketClient()
  client.connect('ws://localhost:9959/')

  const indicators: DXLinkChartIndicators = {
    indicator1: {
      lang: 'dxScript',
      content: 'in depth = 14; out avg = sma(close, depth)',
    },
  }

  const chart = new DXLinkChart(client, indicators)

  chart.addDataListener((candles, indicators, reset, pending) => {
    // your buisness logic here
    console.log('Chart Data', candles, indicators, reset, pending)
  })

  chart.setSubscription(
    {
      symbol: 'AAPL{=d}',
      fromTime: 0,
    },
    {}
  )
}

startChart()

// startFeed()
