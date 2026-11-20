import { Option } from 'effect'
import { describe, expect, test } from 'vitest'

import { formatNumber, parseList, parseOptionalNumber, toAskLevels, toBidLevels } from './ladder'

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

describe('ladder sides', () => {
  const orders = [
    { price: 99, maybeSize: Option.some(1) },
    { price: 101, maybeSize: Option.none() },
    { price: 100, maybeSize: Option.some(2) },
  ]

  test('bids put the highest price first', () => {
    expect(toBidLevels(orders)).toEqual([
      { key: '101', price: 101, maybeSize: Option.none() },
      { key: '100', price: 100, maybeSize: Option.some(2) },
      { key: '99', price: 99, maybeSize: Option.some(1) },
    ])
  })

  test('asks put the lowest price first', () => {
    expect(toAskLevels(orders).map((level) => level.price)).toEqual([99, 100, 101])
  })

  test('a level keeps its key when its size changes and when levels around it come and go', () => {
    const before = toBidLevels(orders)
    const after = toBidLevels([
      { price: 100, maybeSize: Option.some(50) },
      { price: 102, maybeSize: Option.some(7) },
    ])

    expect(before.find((level) => level.price === 100)?.key).toBe('100')
    expect(after.find((level) => level.price === 100)?.key).toBe('100')
  })

  test('levels repeated at one price have distinct keys', () => {
    const levels = toAskLevels([
      { price: 100, maybeSize: Option.some(1) },
      { price: 100, maybeSize: Option.some(2) },
      { price: 101, maybeSize: Option.some(3) },
    ])

    expect(levels.map((level) => level.key)).toEqual(['100', '100#1', '101'])
  })

  test('an empty side has no levels', () => {
    expect(toBidLevels([])).toEqual([])
    expect(toAskLevels([])).toEqual([])
  })
})
