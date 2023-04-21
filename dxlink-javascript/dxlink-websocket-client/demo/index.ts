import { DXLinkWebSocket } from '../src'

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

start().catch((error) => console.error('Start error', error))
