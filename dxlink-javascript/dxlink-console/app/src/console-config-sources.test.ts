import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readInjectedConfig, readSearchConfig } from './console-config-sources'

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  warn.mockRestore()
})

// These readers moved out of the console core: parsing an injected global or a query string is
// a standalone-deployment concern, and a host that passes props uses neither. What core keeps
// is the merge order and the lock rules.
//
// They now return `{ core, descriptorSetUrl?, descriptorSetUrlLocked? }`: the descriptor-set
// URL is the RPC plugin's setting rather than a field on the core profile, but the shipped
// `?descriptors=` parameter and `locked: ['descriptorSetUrl']` still have to work.

describe('readSearchConfig', () => {
  it('reads the three supported parameters', () => {
    expect(readSearchConfig('?ws=wss://host&descriptors=/proto/docs&channels=rpc,feed')).toEqual({
      core: { wsUrl: 'wss://host', channelKinds: ['rpc', 'feed'] },
      descriptorSetUrl: '/proto/docs',
    })
  })

  it('ignores parameters it does not know', () => {
    expect(readSearchConfig('?theme=dark&token=secret')).toEqual({ core: {} })
  })

  it('ignores empty values rather than blanking a default', () => {
    expect(readSearchConfig('?ws=&descriptors=%20&channels=')).toEqual({ core: {} })
  })

  it('keeps every kind it is given, since only the plugins know which are real', () => {
    // Validation moved to `resolveAppConsoleConfig`, where the registered plugin list is
    // known — with an open kind vocabulary there is no fixed list to check against here.
    expect(readSearchConfig('?channels=rpc,custom').core.channelKinds).toEqual(['rpc', 'custom'])
  })

  it('de-duplicates repeated kinds', () => {
    expect(readSearchConfig('?channels=rpc,rpc,feed').core.channelKinds).toEqual(['rpc', 'feed'])
  })

  it('drops blank entries in the channel list', () => {
    expect(readSearchConfig('?channels=rpc,,feed').core.channelKinds).toEqual(['rpc', 'feed'])
  })

  it('does not accept keepalive timings', () => {
    expect(readSearchConfig('?keepalive=1&keepaliveInterval=1')).toEqual({ core: {} })
  })

  it('cannot pin a field, whatever the link says', () => {
    expect(readSearchConfig('?locked=wsUrl').core.locked).toBeUndefined()
  })
})

describe('readInjectedConfig', () => {
  it('returns nothing when the host injected nothing', () => {
    expect(readInjectedConfig({})).toEqual({ core: {} })
    expect(warn).not.toHaveBeenCalled()
  })

  it('reads a full profile, splitting off what belongs to the RPC plugin', () => {
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
      core: {
        wsUrl: 'wss://gateway.example.com',
        keepalive: { interval: 10, timeout: 20, acceptTimeout: 30 },
        channelKinds: ['rpc'],
        locked: ['wsUrl'],
      },
      descriptorSetUrl: '/proto/docs',
      descriptorSetUrlLocked: true,
    })
  })

  it('ignores keys it does not know', () => {
    expect(readInjectedConfig({ __DXLINK_CONFIG__: { authToken: 'secret' } })).toEqual({ core: {} })
  })

  it('warns and falls back when the whole value is not an object', () => {
    expect(readInjectedConfig({ __DXLINK_CONFIG__: 'wss://gateway.example.com' })).toEqual({
      core: {},
    })
    expect(warn).toHaveBeenCalledOnce()
  })

  it('drops a bad field and keeps the good ones', () => {
    expect(
      readInjectedConfig({
        __DXLINK_CONFIG__: { wsUrl: 42, descriptorSetUrl: '/proto/docs' },
      })
    ).toEqual({ core: {}, descriptorSetUrl: '/proto/docs' })
    expect(warn).toHaveBeenCalledOnce()
  })

  it('rejects keepalive timings that are not whole non-negative seconds', () => {
    expect(
      readInjectedConfig({
        __DXLINK_CONFIG__: { keepalive: { interval: 1.5, timeout: -1, acceptTimeout: 30 } },
      }).core
    ).toEqual({ keepalive: { acceptTimeout: 30 } })
  })

  it('survives a malformed profile without throwing', () => {
    expect(
      readInjectedConfig({
        __DXLINK_CONFIG__: { keepalive: 'fast', channelKinds: 'rpc', locked: 'wsUrl' },
      })
    ).toEqual({ core: {} })
  })

  it('keeps only the locks core recognises, and reports the descriptor one separately', () => {
    const input = readInjectedConfig({
      __DXLINK_CONFIG__: { locked: ['wsUrl', 'authToken'] },
    })

    expect(input.core.locked).toEqual(['wsUrl'])
    expect(input.descriptorSetUrlLocked).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
  })
})
