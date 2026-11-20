import { describe, expect, it } from 'vitest'

import { Option } from 'effect'
import { afterEach, beforeEach, vi } from 'vitest'

import {
  type AppConsoleSources,
  resolveAppConsoleConfig,
  resolveDescriptorSettings,
} from './consoleConfig'

const sources = (
  injected: AppConsoleSources['injected'] = { core: {} },
  search: AppConsoleSources['search'] = { core: {} }
): AppConsoleSources => ({ injected, search })

// The descriptor-set URL is the RPC plugin's option rather than a field of the core profile,
// but it follows the profile's precedence rules.
describe('resolveDescriptorSettings', () => {
  it('is empty when nothing supplies a URL', () => {
    expect(resolveDescriptorSettings(sources())).toEqual({ url: '', isLocked: false })
  })

  it('lets the query string override the injected config', () => {
    expect(
      resolveDescriptorSettings(
        sources(
          { core: {}, descriptorSetUrl: '/injected' },
          { core: {}, descriptorSetUrl: '/link' }
        )
      )
    ).toEqual({ url: '/link', isLocked: false })
  })

  it('ignores the query string once the host has pinned the URL', () => {
    expect(
      resolveDescriptorSettings(
        sources(
          { core: {}, descriptorSetUrl: '/pinned', descriptorSetUrlLocked: true },
          { core: {}, descriptorSetUrl: '/link' }
        )
      )
    ).toEqual({ url: '/pinned', isLocked: true })
  })

  it('cannot be pinned from the query string', () => {
    // Only the injected config may lock — a link is written by whoever opened it.
    expect(
      resolveDescriptorSettings(
        sources({ core: {} }, { core: {}, descriptorSetUrl: '/link', descriptorSetUrlLocked: true })
      )
    ).toEqual({ url: '/link', isLocked: false })
  })
})

describe('resolveAppConsoleConfig', () => {
  const location = { protocol: 'https:', host: 'demo.dxfeed.com', pathname: '/debug' }
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    warn.mockRestore()
  })

  it('derives the URL from the page in production and uses the relay in development', () => {
    expect(resolveAppConsoleConfig(sources(), ['feed'], location, true).wsUrl).toBe(
      'wss://demo.dxfeed.com'
    )
    expect(resolveAppConsoleConfig(sources(), ['feed'], location, false).wsUrl).toBe(
      'wss://dxlink-md-ws-dev.dxkube.com'
    )
  })

  it('drops channel kinds no registered plugin provides, with a warning', () => {
    const config = resolveAppConsoleConfig(
      sources({ core: {} }, { core: { channelKinds: ['rpc', 'custom'] } }),
      ['feed', 'rpc'],
      location,
      true
    )

    expect(config.maybeChannelKinds).toEqual(Option.some(['rpc']))
    expect(warn).toHaveBeenCalledOnce()
  })

  it('ignores a channel list that names nothing registered', () => {
    const config = resolveAppConsoleConfig(
      sources({ core: { channelKinds: ['custom'] } }),
      ['feed', 'rpc'],
      location,
      true
    )

    expect(config.maybeChannelKinds).toEqual(Option.none())
  })
})
