import { useColorScheme } from '@mui/material/styles'

export type ResolvedColorScheme = 'light' | 'dark'

/**
 * The color scheme actually on screen, as a plain `'light' | 'dark'`.
 *
 * Needed for third-party components that take a light/dark prop of their own rather than
 * reading the MUI palette — `DxScriptEditor` is the one that does. `useTheme().palette.mode`
 * cannot answer this: the app builds its theme with `cssVariables` + `colorSchemes`, so
 * the palette is emitted as CSS custom properties once and `palette.mode` stays fixed at
 * the default regardless of the scheme in effect.
 *
 * `useColorScheme().mode` is `'system'` until the user picks one explicitly, in which case
 * the resolved value is `systemMode`. Both are `undefined` on the very first render, before
 * the scheme is read back on the client; `'light'` is the fallback, matching MUI's default.
 */
export const useResolvedColorScheme = (): ResolvedColorScheme => {
  const { mode, systemMode } = useColorScheme()
  return (mode === 'system' ? systemMode : mode) ?? 'light'
}
