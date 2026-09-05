import { createTheme } from '@mui/material/styles'
import type { Theme, ThemeOptions } from '@mui/material/styles'
import { deepmerge } from '@mui/utils'

/**
 * The console's own look, as theme options.
 *
 * Everything here is about the console: the surfaces its panels and channel cards sit on,
 * the shape and density of the controls inside them. Nothing here is about a page — no app
 * bar, no font, no global reset — because core does not own the page it is rendered on.
 *
 * **The font is `inherit`, deliberately and not by omission.** An embedded console picks up
 * the host's type, which is what makes it look like part of the documentation rather than a
 * widget pasted into it. Leaving `fontFamily` out does not achieve that — `createTheme` fills
 * in MUI's own Roboto stack, and the console then imposes Roboto on a page that had asked for
 * nothing of the sort. The standalone app overrides this with Inter (`app/src/theme.ts`).
 *
 * `colorSchemeSelector: 'class'` is what makes an embedded console follow the host's dark
 * mode for free: MUI expands it to the descendant selector `.dark &`, and `next-themes` with
 * `attribute="class"` writes exactly `class="dark"` on `<html>`. The two agree without a
 * bridge, so an embedded console renders no mode toggle of its own — the standalone app owns
 * that switch, and always did.
 */
const consoleThemeOptions = {
  cssVariables: {
    colorSchemeSelector: 'class',
  },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#3b6fed' },
        background: { default: '#f5f6f8', paper: '#ffffff' },
      },
    },
    dark: {
      palette: {
        primary: { main: '#7aa2ff' },
        background: { default: '#0b0c0f', paper: '#15171c' },
      },
    },
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily: 'inherit',
    h1: { fontWeight: 700, letterSpacing: '-0.02em' },
    h2: { fontWeight: 700, letterSpacing: '-0.02em' },
    h3: { fontWeight: 700, letterSpacing: '-0.015em' },
    h4: { fontWeight: 700, letterSpacing: '-0.01em' },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { fontWeight: 600, textTransform: 'none' },
  },
  components: {
    MuiCard: {
      defaultProps: {
        variant: 'outlined',
      },
      styleOverrides: {
        root: ({ theme }) => ({
          borderColor: theme.palette.divider,
          backgroundImage: 'none',
          boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04), 0 12px 28px rgba(16, 24, 40, 0.05)',
          ...theme.applyStyles('dark', {
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.5), 0 12px 28px rgba(0, 0, 0, 0.35)',
          }),
        }),
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
    // Compact dropdowns: Select menus open dense, matching the `size="small"` inputs they
    // belong to. The console has no menus of its own (its navigation is buttons), so this
    // effectively scopes to Select popovers.
    MuiMenuItem: {
      defaultProps: {
        dense: true,
      },
      styleOverrides: {
        root: {
          fontSize: '0.8125rem',
          minHeight: 30,
        },
      },
    },
  },
} satisfies ThemeOptions

/**
 * Build the console theme, optionally layered with a host's own options.
 *
 * Overrides are deep-merged on top, later arguments winning — so a host adds a font or
 * retints the palette without restating the rest. Pass the result to
 * {@link ConsolePageProps.theme}, or to a `ThemeProvider` above the page.
 *
 * **The merge happens on the options, not on the theme**, and it has to. `createTheme`'s own
 * variadic form (`createTheme(options, ...args)`) merges its extra arguments into the theme it
 * has already computed, which silently strips anything derived: a `typography.fontFamily`
 * supplied that way lands on the theme, but `body1`, `h1` and the rest were built from the
 * default stack a step earlier and keep it. That surfaced as a console rendering in Roboto
 * while `body` rendered in Inter. Palette entries derive the same way.
 */
export const createConsoleTheme = (...overrides: readonly ThemeOptions[]): Theme =>
  createTheme(
    overrides.reduce<ThemeOptions>(
      (merged, override) => deepmerge(merged, override),
      consoleThemeOptions
    )
  )
