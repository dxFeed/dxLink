import type { FeedEventData } from '@dxfeed/dxlink-api'
import { describe, expect, it } from 'vitest'

import { feedEventKey, feedEventType, feedSubKey } from './feed-view-model'

const event = (fields: Record<string, unknown>): FeedEventData => fields as FeedEventData

describe('feedEventKey', () => {
  it('keys a plain event by its symbol', () => {
    expect(feedEventKey(event({ eventType: 'Quote', eventSymbol: 'AAPL' }))).toBe('AAPL')
  })

  it('appends #source so order sources do not collapse into one row', () => {
    const ntv = event({ eventType: 'Order', eventSymbol: 'AAPL', source: 'NTV' })
    const dex = event({ eventType: 'Order', eventSymbol: 'AAPL', source: 'DEX' })

    expect(feedEventKey(ntv)).toBe('AAPL#NTV')
    expect(feedEventKey(dex)).toBe('AAPL#DEX')
    expect(feedEventKey(ntv)).not.toBe(feedEventKey(dex))
  })

  it('distinguishes the case-sensitive sources dxFeed publishes separately', () => {
    expect(feedEventKey(event({ eventSymbol: 'AAPL', source: 'NTV' }))).not.toBe(
      feedEventKey(event({ eventSymbol: 'AAPL', source: 'ntv' }))
    )
  })

  it('ignores an empty or nullish source rather than emitting a bare #', () => {
    expect(feedEventKey(event({ eventSymbol: 'AAPL', source: '' }))).toBe('AAPL')
    expect(feedEventKey(event({ eventSymbol: 'AAPL', source: null }))).toBe('AAPL')
    expect(feedEventKey(event({ eventSymbol: 'AAPL', source: undefined }))).toBe('AAPL')
  })

  it('falls back to the unknown bucket when the symbol is missing', () => {
    expect(feedEventKey(event({ eventType: 'Quote' }))).toBe('(unknown)')
  })
})

describe('feedEventType', () => {
  it('uses the event type when present', () => {
    expect(feedEventType(event({ eventType: 'Trade' }))).toBe('Trade')
  })

  it('buckets events with a missing or blank type as unknown', () => {
    expect(feedEventType(event({}))).toBe('(unknown)')
    expect(feedEventType(event({ eventType: '' }))).toBe('(unknown)')
    expect(feedEventType(event({ eventType: 42 }))).toBe('(unknown)')
  })
})

describe('feedSubKey', () => {
  it('includes the source only for indexed subscriptions', () => {
    expect(feedSubKey({ type: 'Order', symbol: 'AAPL', kind: 'indexed', source: 'NTV' })).toBe(
      'Order#NTV:AAPL'
    )
    expect(feedSubKey({ type: 'Quote', symbol: 'AAPL', kind: 'regular', source: 'NTV' })).toBe(
      'Quote:AAPL'
    )
  })

  it('separates two sources of the same symbol', () => {
    const ntv = feedSubKey({ type: 'Order', symbol: 'AAPL', kind: 'indexed', source: 'NTV' })
    const dex = feedSubKey({ type: 'Order', symbol: 'AAPL', kind: 'indexed', source: 'DEX' })

    expect(ntv).not.toBe(dex)
  })
})
