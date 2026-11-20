import { describe, expect, test } from 'vitest'

import { SortedList } from './sortedList'

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
