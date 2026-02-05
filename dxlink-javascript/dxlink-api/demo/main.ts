/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  FeedContract,
  FeedDataFormat,
  DXLinkWebSocketClient,
  DXLinkFeed,
  DXLinkDepthOfMarket,
  type Subscription,
  type TimeSeriesSubscription,
  DXLinkIndiChart,
  type DXLinkIndiChartIndicators,
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

async function startIndichart() {
  console.log('Start Indichart')

  const client = new DXLinkWebSocketClient()
  client.connect('wss://demo.dxfeed.com/market-data/dxlink-ws')

  const indicators: DXLinkIndiChartIndicators = {
    indicator1: {
      lang: 'js',
      content:
          `function onTick() {
            const sma = ta.sma(close, input.double("length", 20));
            spline(sma, {title: "SMA"});
          }`,
    },
  }

  const indichart = new DXLinkIndiChart(client, indicators)

  indichart.addIndicatorsStateChangeListener((indicators) => {
    // your buisness logic here
    console.log('Indicators State', indicators)
  })

  indichart.addUpdateListener((candles, indicators, pending) => {
    // your buisness logic here
    console.log('Chart Data', indichart.getSubscription(), candles, indicators, pending)
  })

  indichart.setSubscription(
    {
      symbol: 'AAPL{=d}',
      fromTime: 0,
    },
    {}
  )
}

startIndichart()

// startFeed()
