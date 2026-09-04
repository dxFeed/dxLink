import { createTheme } from '@mui/material/styles'
import { describe, expect, it } from 'vitest'

import { createConsoleTheme } from './theme'

/**
 * MUI types `colorSchemes` and `getColorSchemeSelector` only for projects that opt into CSS
 * variables with a `CssThemeVariables` module augmentation — a project-wide declaration core
 * deliberately does not ship, for the reasons given at `HOST_OWNS_COLOR_SCHEME` in
 * `console-page.tsx`. Both exist on the theme at runtime; this is the narrow accessor that
 * says so.
 */
const asCssVarsTheme = (theme: object) =>
  theme as {
    colorSchemes?: Record<string, unknown>
    getColorSchemeSelector: (scheme: 'light' | 'dark') => string
  }

describe('createConsoleTheme', () => {
  it('selects color schemes by class, which is what a docs-site toggle writes', () => {
    // The whole dark-mode "bridge" is this one string. MUI expands `colorSchemeSelector:
    // 'class'` to a descendant selector, and `next-themes` with `attribute="class"` puts
    // `class="dark"` on <html> — so an embedded console follows the host's toggle with no
    // code in between. A change here silently unbridges it.
    const theme = asCssVarsTheme(createConsoleTheme())

    expect(theme.getColorSchemeSelector('dark')).toBe('.dark &')
    expect(theme.getColorSchemeSelector('light')).toBe('.light &')
  })

  it('carries both color schemes', () => {
    const theme = asCssVarsTheme(createConsoleTheme())

    expect(theme.colorSchemes?.light).toBeDefined()
    expect(theme.colorSchemes?.dark).toBeDefined()
  })

  it('inherits its host type rather than imposing a font', () => {
    // `inherit`, not absent: omitting `fontFamily` gets MUI's Roboto stack filled in, which
    // would impose Roboto on a host page that asked for nothing. Asserted against a stock
    // theme so the test says "not MUI's default" rather than restating a literal.
    const theme = createConsoleTheme()

    expect(theme.typography.fontFamily).toBe('inherit')
    expect(theme.typography.body1.fontFamily).toBe('inherit')
    expect(theme.typography.fontFamily).not.toBe(createTheme().typography.fontFamily)
  })

  it('lets a host layer its own options on top', () => {
    const theme = createConsoleTheme({ typography: { fontFamily: '"Host Sans"' } })

    expect(theme.typography.fontFamily).toBe('"Host Sans"')
    // …without losing the console's own decisions in the merge.
    expect(theme.shape.borderRadius).toBe(10)
    expect(theme.components?.MuiCard?.defaultProps).toEqual({ variant: 'outlined' })
  })

  it('lets an override reach the values derived from it', () => {
    // The merge has to happen on the options, before `createTheme` derives anything. Merged
    // onto the finished theme instead, a `fontFamily` lands on `typography.fontFamily` while
    // `body1` and the headings keep the default stack they were built from — which is exactly
    // how the console came to render in Roboto inside a page rendering in Inter.
    const theme = createConsoleTheme({ typography: { fontFamily: '"Host Sans"' } })

    expect(theme.typography.body1.fontFamily).toBe('"Host Sans"')
    expect(theme.typography.h1.fontFamily).toBe('"Host Sans"')
  })

  it('applies later overrides over earlier ones', () => {
    const theme = createConsoleTheme({ shape: { borderRadius: 2 } }, { shape: { borderRadius: 4 } })

    expect(theme.shape.borderRadius).toBe(4)
  })
})
