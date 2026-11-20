import { Option } from 'effect'
import { describe, expect, test } from 'vitest'

import type { RegisteredChannelPlugin } from '@dxfeed/dxlink-console-foldkit-core'

import { domChannelPlugin } from './plugin'
import type { DomServices } from './service'

describe('plugin', () => {
  test('registers as the DOM service', () => {
    const plugin: RegisteredChannelPlugin<DomServices> = domChannelPlugin

    expect(plugin.kind).toBe('dom')
    expect(plugin.label).toBe('DOM')
    expect(plugin.dialogTitle).toBe('New DOM channel')
    expect(plugin.dialogWidth).toBe('Narrow')
  })

  test('a fresh request can open a channel', () => {
    expect(domChannelPlugin.canOpen(domChannelPlugin.initRequest().model)).toBe(true)
  })

  test('a value of another shape is not taken for a request', () => {
    expect(domChannelPlugin.canOpen({ symbol: 'AAPL' })).toBe(false)
  })

  test('a request opens a channel without a Command of its own', () => {
    const maybeOpen = domChannelPlugin.open(domChannelPlugin.initRequest().model, '7')

    expect(Option.map(maybeOpen, (open) => open.commands)).toEqual(Option.some(undefined))
  })

  test('a value of another shape is not closed as a DOM channel', () => {
    expect(domChannelPlugin.close({ symbol: 'AAPL' })).toEqual({ symbol: 'AAPL' })
  })
})
