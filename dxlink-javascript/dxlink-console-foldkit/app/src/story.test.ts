import { Option } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { builtinConsoleConfig } from '@dxfeed/dxlink-console-foldkit-core'

import { Message, SaveThemeMode, makeApp } from './main'

const { init, update } = makeApp([])

const flags = {
  config: { ...builtinConsoleConfig(), wsUrl: 'wss://flags.test' },
  maybeThemeMode: Option.none(),
  prefersDark: true,
}

describe('init', () => {
  test('the console starts from the profile in the Flags', () => {
    expect(init(flags).model.console.form.url).toBe('wss://flags.test')
  })

  test('with no stored choice the theme follows the system', () => {
    const { model: initial } = init(flags)

    expect(initial.themeMode).toBe('System')
    expect(initial.prefersDark).toBe(true)
  })

  test('a stored choice wins over the system preference', () => {
    expect(init({ ...flags, maybeThemeMode: Option.some('Light') }).model.themeMode).toBe('Light')
  })
})

describe('theme', () => {
  test('choosing a mode applies it and saves it', () => {
    story(
      update,
      given(init(flags).model),
      message(Message.SelectedThemeMode({ mode: 'Dark' })),
      Command.expectExact(SaveThemeMode),
      Command.resolve(SaveThemeMode, Message.CompletedSaveThemeMode()),
      model((next) => {
        expect(next.themeMode).toBe('Dark')
      })
    )
  })

  test('a change of the system preference is tracked without changing the mode', () => {
    story(
      update,
      given(init(flags).model),
      message(Message.ChangedSystemTheme({ prefersDark: false })),
      model((next) => {
        expect(next.prefersDark).toBe(false)
        expect(next.themeMode).toBe('System')
      })
    )
  })
})
