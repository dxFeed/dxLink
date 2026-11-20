import { Option } from 'effect'
import { describe, expect, test } from 'vitest'

import { toOrders } from './book'

describe('toOrders', () => {
  test('a level without a finite price is left out, and one without a size keeps its place', () => {
    expect(
      toOrders([
        { price: Number.NaN, size: 1 },
        { price: 1, size: Number.NaN },
        { price: 2, size: 3 },
      ])
    ).toEqual([
      { price: 1, maybeSize: Option.none() },
      { price: 2, maybeSize: Option.some(3) },
    ])
  })
})
