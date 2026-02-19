import { DXLinkConnectionState } from '@dxfeed/dxlink-core'
import { test } from 'uvu'
import * as assert from 'uvu/assert'

import { DXLinkWebSocketClient } from '../../dxlink-websocket-client/src'

import { DXLinkFeed, FeedContract, FeedDataFormat, type FeedEventData } from './'

const DEMO_URL = 'wss://demo.dxfeed.com/market-data/dxlink-ws'
const EVENT_TIMEOUT_MS = 20_000
const ACTION_TIMEOUT_SEC = 5

const waitForFirstEvents = (
  feed: DXLinkFeed<FeedContract.TICKER>,
  timeoutMs: number
): Promise<FeedEventData[]> =>
  new Promise((resolve, reject) => {
    const listener = (events: FeedEventData[]) => {
      cleanup()
      resolve(events)
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const cleanup = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
      }
      feed.removeEventListener(listener)
    }

    timeoutId = setTimeout(() => {
      cleanup()
      reject(new Error('Timeout waiting for Quote event for AAPL'))
    }, timeoutMs)

    feed.addEventListener(listener)
  })

test(`Live feed service returns Quote for AAPL`, async () => {
  const client = new DXLinkWebSocketClient({
    actionTimeout: ACTION_TIMEOUT_SEC,
    logLevel: 0,
    maxReconnectAttempts: 0,
  })

  const feed = new DXLinkFeed(client, FeedContract.TICKER)
  feed.configure({
    acceptDataFormat: FeedDataFormat.COMPACT,
    acceptEventFields: {
      Quote: ['eventSymbol', 'askPrice', 'bidPrice'],
    },
  })
  feed.addSubscriptions({ type: 'Quote', symbol: 'AAPL' })


  try {
    client.connect(DEMO_URL)

    const events = await waitForFirstEvents(feed, EVENT_TIMEOUT_MS)

    assert.is(events.length, 1)
    const event = events[0]
    assert.is(event.eventType, 'Quote')
    assert.is(event.eventSymbol, 'AAPL')
    assert.ok(typeof event.askPrice === 'number')
    assert.ok(typeof event.bidPrice === 'number')
  } finally {
    feed.close()
    client.disconnect()
  }
})

test.run()
