import { expect, test } from 'vitest'

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

    const cleanup = () => {
      clearTimeout(timeoutId)
      feed.removeEventListener(listener)
    }

    const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
      cleanup()
      reject(new Error('Timeout waiting for Quote event for AAPL'))
    }, timeoutMs)

    feed.addEventListener(listener)
  })

test(
  `Live feed service returns Quote for AAPL`,
  async () => {
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

      expect(events.length).toBe(1)
      const event = events[0]
      expect(event.eventType).toBe('Quote')
      expect(event.eventSymbol).toBe('AAPL')
      expect(typeof event.askPrice === 'number').toBe(true)
      expect(typeof event.bidPrice === 'number').toBe(true)
    } finally {
      feed.close()
      client.disconnect()
    }
  },
  EVENT_TIMEOUT_MS + 10_000
)
