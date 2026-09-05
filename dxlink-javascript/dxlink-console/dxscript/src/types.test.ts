import { describe, expect, it } from 'vitest'

import { createIndicatorEntry } from './types'

describe('createIndicatorEntry', () => {
  it('gives every indicator a distinct identity', () => {
    // These ids are React keys for the uncontrolled dxScript editors. Any collision (or
    // reuse of an array index) lets React hand a mounted editor to a different entry
    // after a removal, so the visible script and the request state drift apart.
    const ids = Array.from({ length: 50 }, () => createIndicatorEntry().id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('starts empty, since the uncontrolled editor cannot be pre-filled', () => {
    expect(createIndicatorEntry().code).toBe('')
  })

  it('carries the code it is given', () => {
    expect(createIndicatorEntry('out sma = sma(close, 14)').code).toBe('out sma = sma(close, 14)')
  })
})
