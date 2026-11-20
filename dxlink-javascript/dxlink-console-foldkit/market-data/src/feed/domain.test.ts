import { Option } from 'effect'
import { describe, expect, test } from 'vitest'

import {
  buildAcceptEventFields,
  buildColumns,
  eventKey,
  eventType,
  subscriptionKey,
  toFeedEvent,
  upsertEvents,
} from './domain'
import { EVENT_TYPES } from './eventTypes'
import { coalesce } from './events'
import { SortedList } from './sortedList'

describe('eventKey', () => {
  test('keys a plain event by its symbol', () => {
    expect(eventKey({ eventType: 'Quote', eventSymbol: 'AAPL' })).toBe('AAPL')
  })

  test('appends #source so order sources do not collapse into one row', () => {
    const ntv = { eventType: 'Order', eventSymbol: 'AAPL', source: 'NTV' }
    const dex = { eventType: 'Order', eventSymbol: 'AAPL', source: 'DEX' }

    expect(eventKey(ntv)).toBe('AAPL#NTV')
    expect(eventKey(dex)).toBe('AAPL#DEX')
  })

  test('distinguishes the case-sensitive sources dxFeed publishes separately', () => {
    expect(eventKey({ eventSymbol: 'AAPL', source: 'NTV' })).not.toBe(
      eventKey({ eventSymbol: 'AAPL', source: 'ntv' })
    )
  })

  test('ignores an empty or nullish source rather than emitting a bare #', () => {
    expect(eventKey({ eventSymbol: 'AAPL', source: '' })).toBe('AAPL')
    expect(eventKey({ eventSymbol: 'AAPL', source: null })).toBe('AAPL')
    expect(eventKey({ eventSymbol: 'AAPL', source: undefined })).toBe('AAPL')
  })

  test('falls back to the unknown bucket when the symbol is missing', () => {
    expect(eventKey({ eventType: 'Quote' })).toBe('(unknown)')
  })
})

describe('eventType', () => {
  test('uses the event type when present', () => {
    expect(eventType({ eventType: 'Trade' })).toBe('Trade')
  })

  test('buckets events with a missing or blank type as unknown', () => {
    expect(eventType({})).toBe('(unknown)')
    expect(eventType({ eventType: '' })).toBe('(unknown)')
    expect(eventType({ eventType: 42 })).toBe('(unknown)')
  })
})

describe('subscriptionKey', () => {
  const order = { type: 'Order', symbol: 'AAPL', fromTime: 0 }

  test('includes the source only for indexed subscriptions', () => {
    expect(subscriptionKey({ ...order, kind: 'Indexed', source: 'NTV' })).toBe('Order#NTV:AAPL')
    expect(subscriptionKey({ ...order, type: 'Quote', kind: 'Regular', source: 'NTV' })).toBe(
      'Quote:AAPL'
    )
  })

  test('separates two sources of the same symbol', () => {
    expect(subscriptionKey({ ...order, kind: 'Indexed', source: 'NTV' })).not.toBe(
      subscriptionKey({ ...order, kind: 'Indexed', source: 'DEX' })
    )
  })
})

describe('upsertEvents', () => {
  test('keeps one row per symbol and source within each type, the latest winning', () => {
    const events = upsertEvents({}, [
      { eventType: 'Order', eventSymbol: 'AAPL', source: 'NTV', price: 1 },
      { eventType: 'Order', eventSymbol: 'AAPL', source: 'DEX', price: 2 },
      { eventType: 'Quote', eventSymbol: 'AAPL', bidPrice: 3 },
      { eventType: 'Order', eventSymbol: 'AAPL', source: 'NTV', price: 4 },
    ])

    expect(Object.keys(events)).toEqual(['Order', 'Quote'])
    expect(Object.keys(events['Order'] ?? {})).toEqual(['AAPL#NTV', 'AAPL#DEX'])
    expect(events['Order']?.['AAPL#NTV']?.['price']).toBe(4)
  })
})

describe('toFeedEvent', () => {
  test('drops absent fields and names non-finite numbers', () => {
    expect(toFeedEvent({ eventSymbol: 'AAPL', bidPrice: Number.NaN, time: undefined })).toEqual({
      eventSymbol: 'AAPL',
      bidPrice: 'NaN',
    })
  })
})

describe('buildColumns', () => {
  test('follows the server-negotiated field order instead of sorting it', () => {
    expect(
      buildColumns(
        [{ eventType: 'Quote', eventSymbol: 'AAPL', bidPrice: 1 }],
        ['eventType', 'eventSymbol', 'bidPrice', 'askPrice']
      )
    ).toEqual(['eventSymbol', 'eventType', 'bidPrice', 'askPrice'])
  })

  test('keeps negotiated fields that no row has yet, so the shape stays visible', () => {
    expect(
      buildColumns([{ eventSymbol: 'AAPL' }], ['eventSymbol', 'bidPrice', 'askPrice'])
    ).toEqual(['eventSymbol', 'bidPrice', 'askPrice'])
  })

  test('appends received fields missing from the negotiated list rather than hiding them', () => {
    expect(
      buildColumns(
        [{ eventSymbol: 'AAPL', bidPrice: 1, zzz: 9, extra: 8 }],
        ['eventSymbol', 'bidPrice']
      )
    ).toEqual(['eventSymbol', 'bidPrice', 'extra', 'zzz'])
  })

  test('orders priority fields first, then alphabetically, without a negotiated order', () => {
    expect(
      buildColumns([{ eventSymbol: 'AAPL', eventType: 'Quote', size: 1, ask: 2 }], [])
    ).toEqual(['eventSymbol', 'eventType', 'ask', 'size'])
  })
})

describe('buildAcceptEventFields', () => {
  test('leads with the mandatory fields and skips rows without a type', () => {
    expect(
      buildAcceptEventFields([
        { id: 1, type: ' Quote ', fields: 'bidPrice, eventSymbol,, askPrice' },
        { id: 2, type: ' ', fields: 'ignored' },
      ])
    ).toEqual(
      Option.some({
        Quote: ['eventType', 'eventSymbol', 'bidPrice', 'askPrice'],
      })
    )
  })

  test('yields nothing when no row names a type', () => {
    expect(buildAcceptEventFields([{ id: 1, type: '', fields: 'a' }])).toEqual(Option.none())
  })
})

describe('EVENT_TYPES', () => {
  test('offers 17 types, without the deprecated DailyCandle', () => {
    expect(EVENT_TYPES).toHaveLength(17)
    expect(EVENT_TYPES).toContain('TradeETH')
    expect(EVENT_TYPES).toContain('Configuration')
    expect(EVENT_TYPES).toContain('Message')
    expect(EVENT_TYPES).not.toContain('DailyCandle')
  })
})

describe('coalesce', () => {
  test('merges a channel’s event bursts and keeps other signals in order', () => {
    const quote = { eventType: 'Quote', eventSymbol: 'AAPL' }
    const trade = { eventType: 'Trade', eventSymbol: 'AAPL' }

    expect(
      coalesce([
        { channelId: '1', message: { _tag: 'Events', events: [quote] } },
        { channelId: '2', message: { _tag: 'Events', events: [trade] } },
        { channelId: '1', message: { _tag: 'Events', events: [trade] } },
        { channelId: '1', message: { _tag: 'Candles', count: 3 } },
        { channelId: '1', message: { _tag: 'Events', events: [quote] } },
      ])
    ).toEqual([
      { channelId: '1', message: { _tag: 'Events', events: [quote, trade] } },
      { channelId: '2', message: { _tag: 'Events', events: [trade] } },
      { channelId: '1', message: { _tag: 'Candles', count: 3 } },
      { channelId: '1', message: { _tag: 'Events', events: [quote] } },
    ])
  })
})

describe('SortedList', () => {
  test('keeps items ordered, replaces equals and removes by comparison', () => {
    const list = new SortedList<{ index: number; value: string }>((a, b) => a.index - b.index)
    list.insert({ index: 2, value: 'b' })
    list.insert({ index: 1, value: 'a' })
    list.insert({ index: 3, value: 'c' })
    list.insert({ index: 2, value: 'B' })

    expect(list.toArray().map((item) => item.value)).toEqual(['a', 'B', 'c'])
    expect(list.remove({ index: 1, value: '' })).toBe(true)
    expect(list.remove({ index: 9, value: '' })).toBe(false)
    expect(list.length).toBe(2)
  })
})
