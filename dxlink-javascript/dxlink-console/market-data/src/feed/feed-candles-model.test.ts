import type { DXLinkClient, DXLinkIndiChartCandle } from '@dxfeed/dxlink-api'
import * as AtomRegistry from 'effect/reactivity/AtomRegistry'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EventFlags } from './candles'
import { makeFeedCandlesModel } from './feed-candles-model'
import type { FeedCandlesModel } from './feed-candles-model'
import type { FakeFeed as FakeFeedType } from '../test/fake-dxlink'

const { FakeFeed } = await vi.hoisted(async () => import('../test/fake-dxlink'))

vi.mock('@dxfeed/dxlink-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dxfeed/dxlink-api')>()),
  DXLinkFeed: (await import('../test/fake-dxlink')).FakeFeed,
}))

const candle = (index: number, eventFlags = 0) => ({
  eventType: 'Candle',
  eventSymbol: 'AAPL{=d}',
  eventFlags,
  index,
  time: index * 1000,
  open: 1,
  high: 2,
  low: 0.5,
  close: 1.5,
  volume: 100,
})

let registry: AtomRegistry.AtomRegistry
let release: () => void
let model: FeedCandlesModel
let pushed: Array<{ candles: DXLinkIndiChartCandle[]; dataType: string }>

const openCandles = (): FakeFeedType => {
  release = registry.mount(model.session.atom)
  const feed = FakeFeed.instances[FakeFeed.instances.length - 1]
  if (feed === undefined) throw new Error('no feed opened')
  return feed
}

beforeEach(() => {
  FakeFeed.instances.length = 0
  pushed = []
  registry = AtomRegistry.make()
  model = makeFeedCandlesModel({} as DXLinkClient, {}, (candles, dataType) =>
    pushed.push({ candles, dataType })
  )
  release = () => undefined
})

afterEach(() => {
  release()
  registry.dispose()
})

describe('candle chart model session', () => {
  it('opens a HISTORY feed asking for compact candles', () => {
    const feed = openCandles()

    expect(feed.channel.parameters).toEqual({ contract: 'HISTORY' })
    expect(feed.accepted[0]).toMatchObject({ acceptDataFormat: 'COMPACT' })
  })

  it('subscribes on the open feed, replacing the previous subscription', () => {
    const feed = openCandles()

    registry.set(model.setSubscription, { symbol: 'AAPL{=d}', fromTime: 0 })

    expect(registry.get(model.subscription)).toEqual({ symbol: 'AAPL{=d}', fromTime: 0 })
    expect(feed.clears).toBe(1)
    expect(feed.added).toEqual([{ type: 'Candle', symbol: 'AAPL{=d}', fromTime: 0 }])
  })

  it('pushes a completed snapshot to the chart, then updates', () => {
    const feed = openCandles()

    feed.eventListeners.emit([
      candle(2, EventFlags.SnapshotBegin) as never,
      candle(1, EventFlags.SnapshotEnd) as never,
    ])
    feed.eventListeners.emit([candle(3) as never])

    expect(pushed.map(({ candles, dataType }) => [dataType, candles.map((c) => c.index)])).toEqual([
      ['candles', [1, 2]],
      ['update', [1, 2, 3]],
    ])
    expect(registry.get(model.candleCount)).toBe(3)
  })

  it('stops pushing once the user closes the channel', () => {
    const feed = openCandles()

    registry.set(model.channel.close, undefined)
    feed.eventListeners.emit([
      candle(1, EventFlags.SnapshotBegin | EventFlags.SnapshotEnd) as never,
    ])

    expect(feed.closed).toBe(true)
    expect(pushed).toEqual([])
  })
})
