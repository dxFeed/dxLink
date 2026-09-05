import { describe, expect, it } from 'vitest'

import { resolveDescriptorSettings } from './console-config'
import type { AppConsoleSources } from './console-config'

const sources = (
  injected: AppConsoleSources['injected'] = { core: {} },
  search: AppConsoleSources['search'] = { core: {} }
): AppConsoleSources => ({ injected, search })

// The descriptor-set URL left the core profile for the RPC plugin's options, but it kept the
// profile's precedence rules — so those rules now need holding to account here.
describe('resolveDescriptorSettings', () => {
  it('is empty when nothing supplies a URL', () => {
    expect(resolveDescriptorSettings(sources())).toEqual({ url: '', locked: false })
  })

  it('lets the query string override the injected config', () => {
    expect(
      resolveDescriptorSettings(
        sources(
          { core: {}, descriptorSetUrl: '/injected' },
          { core: {}, descriptorSetUrl: '/link' }
        )
      )
    ).toEqual({ url: '/link', locked: false })
  })

  it('ignores the query string once the host has pinned the URL', () => {
    expect(
      resolveDescriptorSettings(
        sources(
          { core: {}, descriptorSetUrl: '/pinned', descriptorSetUrlLocked: true },
          { core: {}, descriptorSetUrl: '/link' }
        )
      )
    ).toEqual({ url: '/pinned', locked: true })
  })

  it('cannot be pinned from the query string', () => {
    // Only the injected config may lock — a link is written by whoever opened it.
    expect(
      resolveDescriptorSettings(
        sources({ core: {} }, { core: {}, descriptorSetUrl: '/link', descriptorSetUrlLocked: true })
      )
    ).toEqual({ url: '/link', locked: false })
  })
})
