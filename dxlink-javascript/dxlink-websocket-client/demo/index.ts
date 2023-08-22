import { DXLinkWebSocket } from '../src'
import { DXLinkWebSocketConnectorConfig, DXLinkWebSocketConnector, DXLinkError } from '../src/v2'

async function start() {
  console.log('Start')

  const client = await DXLinkWebSocket.newClient({
    url: 'wss://demo.dxfeed.com/dxlink-ws',
  })

  client.connectionState.subscribe((state) => {
    console.log('Connection state', state)
  })

  client.error.subscribe((error) => {
    console.error('Client error', error)
  })

  console.log('Client created', client)

  const channel = await client.openFeedChannel('TICKER')

  console.log('Channel opened', channel)

  channel.data.subscribe((events) => {
    console.log('data', events)
  })

  channel.setup({
    acceptAggregationPeriod: 10,
    acceptDataFormat: 'COMPACT',
    acceptEventFields: {
      Quote: ['eventSymbol', 'askPrice', 'bidPrice'],
      Candle: ['eventSymbol', 'open', 'close', 'high', 'low', 'volume'],
    },
  })

  channel.config.subscribe((config) => {
    console.log('config', config)
  })

  const sub1 = { type: 'Quote', symbol: 'ETH/USD:GDAX' }
  const sub2 = { type: 'Candle', symbol: 'ETH/USD:GDAX{=d}', fromTime: 0 }

  channel.subscription({ add: [sub1] })

  setTimeout(() => {
    channel.subscription({ add: [sub2], remove: [sub1] })

    setTimeout(() => {
      channel.subscription({ reset: true })
    }, 3000)
  }, 3000)
}

async function startV2() {
  const config: DXLinkWebSocketConnectorConfig = {
    url: 'wss://demo.dxfeed.com/dxlink-ws',
  }
  const connector = new DXLinkWebSocketConnector(config)

  const connection = await connector.connect()

  const channel = await connection.openChannel('FEED', { contract: 'TICKER' })

  channel.send({
    type: 'FEED_SETUP',
    acceptAggregationPeriod: 10,
    acceptDataFormat: 'COMPACT',
    acceptEventFields: {
      Quote: ['eventSymbol', 'askPrice', 'bidPrice'],
      Candle: ['eventSymbol', 'open', 'close', 'high', 'low', 'volume'],
    },
  })

  const symbol1 = { type: 'Quote', symbol: 'ETH/USD:GDAX' }

  // channel.send({
  //   type: 'FEED_SUBSCRIPTION',
  //   add: [symbol1],
  // })

  channel.addLifecycleHandler({
    handleState(state) {
      console.log('Channel state', state)
    },
    handleError(error: DXLinkError) {
      console.error('Channel error', error)
    },
  })

  channel.addMessageHandler((message) => {
    console.log('Channel message', message)
  })
}

startV2().catch((error) => console.error('Start error', error))
