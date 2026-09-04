import { describe, expect, it } from 'vitest'

import { ALL_SESSION_DAYS, formatSession, normalizeSessionTime, parseSession } from './session'

describe('parseSession', () => {
  it('reads a compact window as every day', () => {
    expect(parseSession('0930-1600')).toEqual({
      start: '09:30',
      end: '16:00',
      days: ALL_SESSION_DAYS,
    })
  })

  it('reads a colon-separated window', () => {
    expect(parseSession('09:30-16:00')?.start).toBe('09:30')
  })

  it('reads a day restriction', () => {
    expect(parseSession('0930-1600:12345')).toEqual({
      start: '09:30',
      end: '16:00',
      days: ['1', '2', '3', '4', '5'],
    })
  })

  it('deduplicates repeated days', () => {
    expect(parseSession('0930-1600:1121')?.days).toEqual(['1', '2'])
  })

  it('tolerates surrounding whitespace', () => {
    expect(parseSession('  0930-1600  ')?.end).toBe('16:00')
  })

  it('rejects out-of-range times rather than sending them on', () => {
    expect(parseSession('2500-1600')).toBeUndefined()
    expect(parseSession('0930-1660')).toBeUndefined()
  })

  it('rejects anything that is not a session, so raw text is left alone', () => {
    for (const value of ['', 'always', '0930', '0930-', '930-1600', '0930-1600:8', '0930-1600:0']) {
      expect(parseSession(value)).toBeUndefined()
    }
  })

  it('accepts midnight boundaries', () => {
    expect(parseSession('0000-2359')).toEqual({
      start: '00:00',
      end: '23:59',
      days: ALL_SESSION_DAYS,
    })
  })
})

describe('formatSession', () => {
  it('omits the day suffix when every day is selected', () => {
    expect(formatSession({ start: '09:30', end: '16:00', days: ALL_SESSION_DAYS })).toBe(
      '0930-1600'
    )
  })

  it('omits the day suffix when none is selected, which is not expressible', () => {
    expect(formatSession({ start: '09:30', end: '16:00', days: [] })).toBe('0930-1600')
  })

  it('writes a day suffix for a subset', () => {
    expect(formatSession({ start: '09:30', end: '16:00', days: ['1', '3', '5'] })).toBe(
      '0930-1600:135'
    )
  })

  it('orders and deduplicates days regardless of how they were toggled', () => {
    expect(formatSession({ start: '09:30', end: '16:00', days: ['5', '1', '3', '1'] })).toBe(
      '0930-1600:135'
    )
  })

  it('ignores day values outside 1-7', () => {
    expect(formatSession({ start: '09:30', end: '16:00', days: ['1', '9'] })).toBe('0930-1600:1')
  })

  it('round-trips every value it can parse', () => {
    for (const value of ['0930-1600', '0930-1600:12345', '0000-2359', '0800-0930:67']) {
      const parts = parseSession(value)
      expect(parts, value).toBeDefined()
      expect(formatSession(parts!), value).toBe(value)
    }
  })
})

describe('normalizeSessionTime', () => {
  it('pads a missing value to midnight', () => {
    expect(normalizeSessionTime(undefined)).toBe('00:00')
    expect(normalizeSessionTime('')).toBe('00:00')
  })

  it('inserts the colon a time input expects', () => {
    expect(normalizeSessionTime('0930')).toBe('09:30')
    expect(normalizeSessionTime('09:30')).toBe('09:30')
  })
})
