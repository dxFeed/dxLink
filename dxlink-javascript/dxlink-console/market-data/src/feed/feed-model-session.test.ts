import type { DXLinkClient, FeedEventData } from '@dxfeed/dxlink-api'
import * as AtomRegistry from 'effect/reactivity/AtomRegistry'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeFeedModel } from './feed-model'
import type { FeedModel } from './feed-model'
import type { FakeFeed as FakeFeedType } from '../test/fake-dxlink'

const { FakeFeed } = await vi.hoisted(async () => import('../test/fake-dxlink'))

vi.mock('@dxfeed/dxlink-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dxfeed/dxlink-api')>()),
  DXLinkFeed: (await import('../test/fake-dxlink')).FakeFeed,
}))

const quote = (symbol: string, bidPrice: number) =>
  ({ eventType: 'Quote', eventSymbol: symbol, bidPrice }) as FeedEventData

let registry: AtomRegistry.AtomRegistry
let release: () => void
let model: FeedModel

const openFeed = (): FakeFeedType => {
  release = registry.mount(model.session.atom)
  const feed = FakeFeed.instances[FakeFeed.instances.length - 1]
  if (feed === undefined) throw new Error('no feed opened')
  return feed
}

beforeEach(() => {
  FakeFeed.instances.length = 0
  registry = AtomRegistry.make()
  model = makeFeedModel({} as DXLinkClient, { feed: 'demo' })
  release = () => undefined
})

afterEach(() => {
  release()
  registry.dispose()
})

describe('feed model session', () => {
  it('opens one AUTO feed and records its channel', () => {
    const feed = openFeed()

    expect(FakeFeed.instances).toHaveLength(1)
    expect(feed.options).toMatchObject({ feed: 'demo' })
    expect(registry.get(model.channel.id)).toBe(feed.channel.id)
    expect(registry.get(model.channel.parameters)).toEqual({ contract: 'AUTO' })

    feed.channel.setState('OPENED' as never)
    expect(registry.get(model.channel.state)).toBe('OPENED')
  })

  it('coalesces received events into the table', async () => {
    const feed = openFeed()

    feed.eventListeners.emit([quote('AAPL', 1)])
    feed.eventListeners.emit([quote('AAPL', 2), quote('MSFT', 3)])
    expect(registry.get(model.events)).toEqual({})

    await vi.waitFor(() =>
      expect(registry.get(model.events).Quote).toMatchObject({
        AAPL: { bidPrice: 2 },
        MSFT: { bidPrice: 3 },
      })
    )

    registry.set(model.clearEvents, undefined)
    expect(registry.get(model.events)).toEqual({})
  })

  it('collects channel errors until cleared', () => {
    const feed = openFeed()

    feed.channel.errorListeners.emit({ type: 'BAD_ACTION', message: 'Unknown symbol' })

    expect(registry.get(model.channel.errors)).toMatchObject([{ message: 'Unknown symbol' }])
    registry.set(model.channel.clearErrors, undefined)
    expect(registry.get(model.channel.errors)).toEqual([])
  })

  it('sends subscription commands to the open feed, once per key', () => {
    const feed = openFeed()
    const order = { type: 'Order', symbol: 'AAPL', kind: 'indexed', source: 'NTV' } as const

    registry.set(model.addSubscription, order)
    registry.set(model.addSubscription, order)
    expect(feed.added).toEqual([{ type: 'Order', symbol: 'AAPL', source: 'NTV' }])

    registry.set(model.removeSubscription, order)
    expect(feed.removed).toEqual([{ type: 'Order', symbol: 'AAPL', source: 'NTV' }])
    expect(registry.get(model.subscriptions)).toEqual([])

    registry.set(model.addSubscription, { type: 'Quote', symbol: 'AAPL', kind: 'regular' })
    registry.set(model.clearSubscriptions, undefined)
    expect(feed.clears).toBe(1)
    expect(registry.get(model.subscriptions)).toEqual([])

    registry.set(model.configure, { acceptAggregationPeriod: 1 })
    expect(feed.accepted).toEqual([{ acceptAggregationPeriod: 1 }])
  })

  it('puts subscriptions made before the channel opened on the wire when it does', () => {
    registry.set(model.addSubscription, {
      type: 'Candle',
      symbol: 'AAPL{=d}',
      kind: 'timeSeries',
      fromTime: 10,
    })

    const feed = openFeed()

    expect(feed.added).toEqual([{ type: 'Candle', symbol: 'AAPL{=d}', fromTime: 10 }])
  })

  it('closes the feed, and stops listening, when the user closes the channel', () => {
    const feed = openFeed()
    registry.set(model.addSubscription, { type: 'Quote', symbol: 'AAPL', kind: 'regular' })

    registry.set(model.channel.close, undefined)

    expect(feed.closed).toBe(true)
    expect(feed.listenerCount).toBe(0)
    // Closing is terminal: a command afterwards has no feed to reach.
    registry.set(model.addSubscription, { type: 'Trade', symbol: 'AAPL', kind: 'regular' })
    expect(feed.added).toHaveLength(1)
    expect(FakeFeed.instances).toHaveLength(1)
  })
})
