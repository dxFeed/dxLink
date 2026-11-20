import { describe, expect, test } from 'vitest'

import { EVENT_TYPES } from './eventTypes'

describe('EVENT_TYPES', () => {
  test('offers 17 types, without the deprecated DailyCandle', () => {
    expect(EVENT_TYPES).toHaveLength(17)
    expect(EVENT_TYPES).toContain('TradeETH')
    expect(EVENT_TYPES).toContain('Configuration')
    expect(EVENT_TYPES).toContain('Message')
    expect(EVENT_TYPES).not.toContain('DailyCandle')
  })
})
