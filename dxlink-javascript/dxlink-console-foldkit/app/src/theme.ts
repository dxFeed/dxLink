import { Effect, Option, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import { BrowserKeyValueStore } from '@effect/platform-browser'

/** What the theme switcher offers. `System` follows the OS preference as it changes. */
export const ThemeMode = Schema.Literals(['System', 'Light', 'Dark'])
export type ThemeMode = typeof ThemeMode.Type

export const THEME_MODES: ReadonlyArray<ThemeMode> = ['System', 'Light', 'Dark']

const THEME_STORAGE_KEY = 'dxlink-console-theme'

export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

/** The mode the user chose on an earlier visit; `None` when nothing valid is stored. */
export const loadThemeMode: Effect.Effect<Option.Option<ThemeMode>> = Effect.gen(function* () {
  const store = yield* KeyValueStore.KeyValueStore
  const stored = yield* store.get(THEME_STORAGE_KEY)

  return Option.filter(Option.fromNullishOr(stored), Schema.is(ThemeMode))
}).pipe(
  Effect.orElseSucceed(() => Option.none<ThemeMode>()),
  Effect.provide(BrowserKeyValueStore.layerLocalStorage)
)

export const saveThemeMode = (mode: ThemeMode): Effect.Effect<void> =>
  Effect.gen(function* () {
    const store = yield* KeyValueStore.KeyValueStore
    yield* store.set(THEME_STORAGE_KEY, mode)
  }).pipe(Effect.ignore, Effect.provide(BrowserKeyValueStore.layerLocalStorage))

export const isDark = (mode: ThemeMode, prefersDark: boolean): boolean =>
  mode === 'Dark' || (mode === 'System' && prefersDark)
