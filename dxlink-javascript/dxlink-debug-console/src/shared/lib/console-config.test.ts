import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LocationLike } from './connection-url'
import {
  builtinConsoleConfig,
  readInjectedConfig,
  readSearchConfig,
  resolveConsoleConfig,
} from './console-config'

const LOCATION: LocationLike = { protocol: 'https:', host: 'demo.dxfeed.com', pathname: '/debug' }

/** Every source is optional, so most cases only care about one of them. */
const resolve = (sources: Partial<Parameters<typeof resolveConsoleConfig>[0]> = {}) =>
  resolveConsoleConfig({ location: LOCATION, ...sources })

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  warn.mockRestore()
})

describe('builtinConsoleConfig', () => {
  it('reproduces the values the forms used to hardcode', () => {
    expect(builtinConsoleConfig(LOCATION)).toEqual({
      wsUrl: 'wss://demo.dxfeed.com',
      keepalive: { interval: 30, timeout: 60, acceptTimeout: 60 },
      descriptorSetUrl: '',
      channelKinds: ['feed', 'dom', 'indichart', 'rpc'],
      locked: [],
    })
  })

  it('derives the WebSocket URL from the location and nothing else', () => {
    expect(
      builtinConsoleConfig({ protocol: 'http:', host: 'localhost:4280', pathname: '/' }).wsUrl
    ).toBe('ws://localhost:4280/')
  })
})

describe('resolveConsoleConfig precedence', () => {
  it('lets the app layer override the built-in defaults', () => {
    expect(resolve({ app: { wsUrl: 'wss://relay.example.com' } }).wsUrl).toBe(
      'wss://relay.example.com'
    )
  })

  it('lets the injected config override the app layer', () => {
    expect(
      resolve({
        app: { wsUrl: 'wss://relay.example.com' },
        injected: { wsUrl: 'wss://gateway.example.com' },
      }).wsUrl
    ).toBe('wss://gateway.example.com')
  })

  it('lets the query string override the injected config', () => {
    expect(
      resolve({
        injected: { wsUrl: 'wss://gateway.example.com' },
        search: '?ws=wss://pasted.example.com',
      }).wsUrl
    ).toBe('wss://pasted.example.com')
  })

  it('merges keepalive field by field, so a source can set one timing', () => {
    expect(resolve({ injected: { keepalive: { interval: 5 } } }).keepalive).toEqual({
      interval: 5,
      timeout: 60,
      acceptTimeout: 60,
    })
  })
})

describe('resolveConsoleConfig locking', () => {
  it('ignores the query parameter for a locked field', () => {
    const config = resolve({
      injected: { wsUrl: 'wss://gateway.example.com', locked: ['wsUrl'] },
      search: '?ws=wss://pasted.example.com',
    })

    expect(config.wsUrl).toBe('wss://gateway.example.com')
    expect(config.locked).toEqual(['wsUrl'])
  })

  it('still applies query parameters for fields that are not locked', () => {
    const config = resolve({
      injected: { wsUrl: 'wss://gateway.example.com', locked: ['wsUrl'] },
      search: '?ws=wss://pasted.example.com&descriptors=/proto/docs&channels=rpc',
    })

    expect(config.wsUrl).toBe('wss://gateway.example.com')
    expect(config.descriptorSetUrl).toBe('/proto/docs')
    expect(config.channelKinds).toEqual(['rpc'])
  })

  it('cannot be asked to lock a field from the query string', () => {
    expect(resolve({ search: '?locked=wsUrl&lock=wsUrl' }).locked).toEqual([])
  })

  it('does not erase a value the app layer supplied for a locked field', () => {
    // Locks gate the query string, not the deployment's own layers: the injected config
    // pinning a field it did not set must leave the app default in place.
    expect(
      resolve({ app: { wsUrl: 'wss://relay.example.com' }, injected: { locked: ['wsUrl'] } }).wsUrl
    ).toBe('wss://relay.example.com')
  })

  it('locks keepalive as one group', () => {
    const config = resolve({
      injected: { keepalive: { interval: 5 }, locked: ['keepalive'] },
      search: '?ws=wss://pasted.example.com',
    })

    expect(config.keepalive.interval).toBe(5)
    expect(config.wsUrl).toBe('wss://pasted.example.com')
  })
})

describe('readSearchConfig', () => {
  it('reads the three supported parameters', () => {
    expect(readSearchConfig('?ws=wss://host&descriptors=/proto/docs&channels=rpc,feed')).toEqual({
      wsUrl: 'wss://host',
      descriptorSetUrl: '/proto/docs',
      channelKinds: ['rpc', 'feed'],
    })
  })

  it('ignores parameters it does not know', () => {
    expect(readSearchConfig('?theme=dark&token=secret')).toEqual({})
  })

  it('ignores empty values rather than blanking a default', () => {
    expect(readSearchConfig('?ws=&descriptors=%20&channels=')).toEqual({})
  })

  it('keeps the channel kinds it recognises and drops the rest', () => {
    expect(readSearchConfig('?channels=rpc,nope,feed').channelKinds).toEqual(['rpc', 'feed'])
    expect(warn).toHaveBeenCalled()
  })

  it('ignores a channel list that leaves nothing', () => {
    expect(readSearchConfig('?channels=nope,alsonope').channelKinds).toBeUndefined()
  })

  it('de-duplicates repeated kinds', () => {
    expect(readSearchConfig('?channels=rpc,rpc,feed').channelKinds).toEqual(['rpc', 'feed'])
  })

  it('does not accept keepalive timings', () => {
    expect(readSearchConfig('?keepalive=1&keepaliveInterval=1')).toEqual({})
  })
})

describe('readInjectedConfig', () => {
  it('returns nothing when the host injected nothing', () => {
    expect(readInjectedConfig({})).toEqual({})
    expect(warn).not.toHaveBeenCalled()
  })

  it('reads a full profile', () => {
    expect(
      readInjectedConfig({
        __DXLINK_CONFIG__: {
          wsUrl: 'wss://gateway.example.com',
          descriptorSetUrl: '/proto/docs',
          keepalive: { interval: 10, timeout: 20, acceptTimeout: 30 },
          channelKinds: ['rpc'],
          locked: ['wsUrl', 'descriptorSetUrl'],
        },
      })
    ).toEqual({
      wsUrl: 'wss://gateway.example.com',
      descriptorSetUrl: '/proto/docs',
      keepalive: { interval: 10, timeout: 20, acceptTimeout: 30 },
      channelKinds: ['rpc'],
      locked: ['wsUrl', 'descriptorSetUrl'],
    })
  })

  it('ignores keys it does not know', () => {
    expect(readInjectedConfig({ __DXLINK_CONFIG__: { authToken: 'secret' } })).toEqual({})
  })

  it('warns and falls back when the whole value is not an object', () => {
    expect(readInjectedConfig({ __DXLINK_CONFIG__: 'wss://gateway.example.com' })).toEqual({})
    expect(warn).toHaveBeenCalledOnce()
  })

  it('drops a bad field and keeps the good ones', () => {
    expect(
      readInjectedConfig({
        __DXLINK_CONFIG__: { wsUrl: 42, descriptorSetUrl: '/proto/docs' },
      })
    ).toEqual({ descriptorSetUrl: '/proto/docs' })
    expect(warn).toHaveBeenCalledOnce()
  })

  it('rejects keepalive timings that are not whole non-negative seconds', () => {
    expect(
      readInjectedConfig({
        __DXLINK_CONFIG__: { keepalive: { interval: 1.5, timeout: -1, acceptTimeout: 30 } },
      })
    ).toEqual({ keepalive: { acceptTimeout: 30 } })
  })

  it('survives a malformed profile without throwing', () => {
    expect(
      readInjectedConfig({
        __DXLINK_CONFIG__: { keepalive: 'fast', channelKinds: 'rpc', locked: 'wsUrl' },
      })
    ).toEqual({})
  })

  it('keeps only the locks it recognises', () => {
    expect(
      readInjectedConfig({ __DXLINK_CONFIG__: { locked: ['wsUrl', 'authToken'] } }).locked
    ).toEqual(['wsUrl'])
  })
})
