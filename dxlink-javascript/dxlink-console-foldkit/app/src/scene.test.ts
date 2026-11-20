import { Option } from 'effect'
import { Command, click, expect, given, role, scene, text } from 'foldkit/scene'
import { describe, test } from 'vitest'

import { builtinConsoleConfig } from '@dxfeed/dxlink-console-foldkit-core'

import { Message, SaveThemeMode, makeApp } from './main'

const { init, update, view } = makeApp([])

const initialModel = init({
  config: { ...builtinConsoleConfig(), wsUrl: 'wss://flags.test' },
  maybeThemeMode: Option.none(),
  prefersDark: false,
}).model

describe('app shell', () => {
  test('the page shows the brand, the theme switcher and the console', () => {
    scene(
      { update, view },
      given(initialModel),
      expect(role('img', { name: 'dxFeed' })).toExist(),
      expect(role('button', { name: 'System theme' })).toExist(),
      expect(role('heading', { name: 'Connection' })).toExist(),
      expect(text('Not connected')).toExist()
    )
  })

  test('the theme switcher marks the chosen mode', () => {
    scene(
      { update, view },
      given(initialModel),
      expect(role('button', { name: 'System theme' })).toHaveAttr('aria-pressed', 'true'),
      click(role('button', { name: 'Dark theme' })),
      Command.resolve(SaveThemeMode, Message.CompletedSaveThemeMode()),
      expect(role('button', { name: 'Dark theme' })).toHaveAttr('aria-pressed', 'true'),
      expect(role('button', { name: 'System theme' })).toHaveAttr('aria-pressed', 'false')
    )
  })
})
