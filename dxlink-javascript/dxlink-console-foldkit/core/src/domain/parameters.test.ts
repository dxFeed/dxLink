import { describe, expect, it } from 'vitest'

import { describeChannelParameters } from './parameters'

describe('describeChannelParameters', () => {
  it('renders scalars, lists and objects as text', () => {
    expect(
      describeChannelParameters({
        symbol: 'AAPL',
        depth: 5,
        sources: ['NTV', 'DEX'],
        filter: { type: 'Order' },
      })
    ).toEqual({
      symbol: 'AAPL',
      depth: '5',
      sources: 'NTV, DEX',
      filter: '{"type":"Order"}',
    })
  })

  it('drops parameters that say nothing', () => {
    expect(
      describeChannelParameters({ feed: undefined, space: null, sources: [], contract: '' })
    ).toEqual({})
  })
})
