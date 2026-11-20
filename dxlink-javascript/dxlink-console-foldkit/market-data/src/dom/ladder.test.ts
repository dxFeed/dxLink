import { Option } from 'effect'
import { describe, expect, test } from 'vitest'

import { formatNumber, parseList, parseOptionalNumber, toLadderRows } from './ladder'

describe('parseList', () => {
  test('splits on commas and whitespace and drops blanks', () => {
    expect(parseList(' ntv, glbx  AGGREGATE,,')).toEqual(['ntv', 'glbx', 'AGGREGATE'])
  })

  test('a blank string is an empty list', () => {
    expect(parseList('  ')).toEqual([])
  })
})

describe('parseOptionalNumber', () => {
  test('a blank draft means the server default', () => {
    expect(parseOptionalNumber('  ')).toEqual(Option.none())
  })

  test('zero is a value, not an absence', () => {
    expect(parseOptionalNumber('0')).toEqual(Option.some(0))
  })

  test('text that is not a number is dropped', () => {
    expect(parseOptionalNumber('abc')).toEqual(Option.none())
  })
})

describe('formatNumber', () => {
  test('a number that is not finite reads as a dash', () => {
    expect(formatNumber(Number.NaN)).toBe('—')
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('—')
  })

  test('a finite number is rendered', () => {
    expect(formatNumber(5)).toBe('5')
  })
})

describe('toLadderRows', () => {
  test('puts the best levels first: highest bid beside lowest ask', () => {
    const rows = toLadderRows(
      [
        { price: 99, size: 1 },
        { price: 100, size: 2 },
      ],
      [
        { price: 102, size: 3 },
        { price: 101, size: 4 },
      ]
    )

    expect(rows).toEqual([
      {
        level: 1,
        maybeBid: Option.some({ price: 100, size: 2 }),
        maybeAsk: Option.some({ price: 101, size: 4 }),
      },
      {
        level: 2,
        maybeBid: Option.some({ price: 99, size: 1 }),
        maybeAsk: Option.some({ price: 102, size: 3 }),
      },
    ])
  })

  test('the shorter side runs out', () => {
    const rows = toLadderRows([{ price: 100, size: 2 }], [])

    expect(rows).toEqual([
      {
        level: 1,
        maybeBid: Option.some({ price: 100, size: 2 }),
        maybeAsk: Option.none(),
      },
    ])
  })

  test('an empty book has no rows', () => {
    expect(toLadderRows([], [])).toEqual([])
  })
})
