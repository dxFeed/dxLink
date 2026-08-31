import { describe, expect, it } from 'vitest'

import { builtinConsoleConfig, isConsoleConfigLock, resolveConsoleConfig } from './console-config'

/** Every source is optional, so most cases only care about one of them. */
const resolve = (sources: Parameters<typeof resolveConsoleConfig>[0] = {}) =>
  resolveConsoleConfig(sources)

describe('builtinConsoleConfig', () => {
  it('holds no opinion about the endpoint or the services on offer', () => {
    expect(builtinConsoleConfig()).toEqual({
      wsUrl: '',
      keepalive: { interval: 30, timeout: 60, acceptTimeout: 60 },
      channelKinds: null,
      locked: [],
    })
  })

  it('derives no URL, so core never has to know how it is deployed', () => {
    // The whole point of the inversion: a WebSocket URL implies knowing whether this console
    // sits next to its endpoint, and that is the host's answer to give.
    expect(builtinConsoleConfig().wsUrl).toBe('')
  })
})

describe('resolveConsoleConfig precedence', () => {
  it('lets the app layer override the built-in defaults', () => {
    expect(resolve({ app: { wsUrl: 'wss://app.example.com' } }).wsUrl).toBe('wss://app.example.com')
  })

  it('lets the injected config override the app layer', () => {
    expect(
      resolve({
        app: { wsUrl: 'wss://app.example.com' },
        injected: { wsUrl: 'wss://injected.example.com' },
      }).wsUrl
    ).toBe('wss://injected.example.com')
  })

  it('lets the query string override the injected config', () => {
    expect(
      resolve({
        injected: { wsUrl: 'wss://injected.example.com' },
        search: { wsUrl: 'wss://link.example.com' },
      }).wsUrl
    ).toBe('wss://link.example.com')
  })

  it('merges keepalive field by field, so a source can set one timing', () => {
    expect(resolve({ injected: { keepalive: { interval: 5 } } }).keepalive).toEqual({
      interval: 5,
      timeout: 60,
      acceptTimeout: 60,
    })
  })

  it('takes an explicit empty channel list rather than treating it as unset', () => {
    // `null` means "every registered plugin" and `[]` means "none"; a source that says `[]`
    // must not fall through to the default the way an absent field does.
    expect(resolve({ injected: { channelKinds: [] } }).channelKinds).toEqual([])
  })

  it('leaves channelKinds unrestricted when no source names any', () => {
    expect(resolve().channelKinds).toBeNull()
  })
})

describe('resolveConsoleConfig locking', () => {
  it('ignores the query parameter for a locked field', () => {
    expect(
      resolve({
        injected: { wsUrl: 'wss://pinned.example.com', locked: ['wsUrl'] },
        search: { wsUrl: 'wss://link.example.com' },
      }).wsUrl
    ).toBe('wss://pinned.example.com')
  })

  it('still applies query parameters for fields that are not locked', () => {
    const config = resolve({
      injected: { wsUrl: 'wss://pinned.example.com', locked: ['wsUrl'] },
      search: { wsUrl: 'wss://link.example.com', channelKinds: ['rpc'] },
    })

    expect(config.wsUrl).toBe('wss://pinned.example.com')
    expect(config.channelKinds).toEqual(['rpc'])
  })

  it('cannot be asked to lock a field from the query string', () => {
    expect(resolve({ search: { locked: ['wsUrl'] } }).locked).toEqual([])
  })

  it('does not erase a value the app layer supplied for a locked field', () => {
    // Locks gate the query string, not the app layer — that is the same deployment speaking.
    expect(
      resolve({
        app: { wsUrl: 'wss://app.example.com' },
        injected: { locked: ['wsUrl'] },
        search: { wsUrl: 'wss://link.example.com' },
      }).wsUrl
    ).toBe('wss://app.example.com')
  })

  it('locks keepalive as one group', () => {
    expect(
      resolve({
        injected: { keepalive: { interval: 5 }, locked: ['keepalive'] },
        search: { keepalive: { interval: 99, timeout: 99 } },
      }).keepalive
    ).toEqual({ interval: 5, timeout: 60, acceptTimeout: 60 })
  })
})

describe('isConsoleConfigLock', () => {
  it('accepts the field groups this console can pin', () => {
    expect(isConsoleConfigLock('wsUrl')).toBe(true)
    expect(isConsoleConfigLock('keepalive')).toBe(true)
  })

  it('rejects anything else, descriptorSetUrl included', () => {
    // It moved to the RPC plugin's options: core has no vocabulary for one service's fields.
    expect(isConsoleConfigLock('descriptorSetUrl')).toBe(false)
    expect(isConsoleConfigLock('nonsense')).toBe(false)
    expect(isConsoleConfigLock(7)).toBe(false)
  })
})
