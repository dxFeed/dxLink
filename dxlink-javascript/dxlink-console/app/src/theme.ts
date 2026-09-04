import { createConsoleTheme } from '@dxfeed/dxlink-console-core'

/**
 * Font stack: self-hosted Inter (variable) with system fallbacks. The font file
 * itself is imported once in `main.tsx`.
 */
const FONT_FAMILY = [
  '"Inter Variable"',
  'Inter',
  'system-ui',
  '-apple-system',
  '"Segoe UI"',
  'Roboto',
  '"Helvetica Neue"',
  'Arial',
  'sans-serif',
].join(', ')

/**
 * App theme: the console's own theme plus the layer that is this app's rather than the
 * console's.
 *
 * The split is the point. `createConsoleTheme()` owns everything about the console —
 * palette, shape, the density of the controls inside its panels — and is what an embedding
 * host gets. What is added here is what only a page can own:
 *
 *  - **the font.** Core names none, so an embedded console inherits its host's type. This
 *    app is the host of itself, so it names Inter.
 *  - **the app bar**, which core has no equivalent of — the console is a page area, not a
 *    chrome.
 *  - **the global `CssBaseline` overrides**, which reach `html` and so exist only where a
 *    global baseline does. `ConsolePage` uses `ScopedCssBaseline`, which is a different theme
 *    slot and never sees these.
 *
 * Light + dark color schemes follow the OS by default (`defaultMode="system"` on the
 * provider); the class-based `colorSchemeSelector` comes from the console theme, and lets
 * `InitColorSchemeScript` apply the stored scheme before first paint. Scheme-specific styles
 * inside overrides use `theme.applyStyles('dark', …)`.
 */
export const theme = createConsoleTheme({
  typography: {
    fontFamily: FONT_FAMILY,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // dxcharts-lite reads its required `--dx-chart-*` tokens from the
        // document root at chart creation; the package ships light-only
        // defaults. Map them onto MUI's palette CSS variables so the chart
        // follows the active color scheme. `html:root` outranks the package's
        // `:root` regardless of stylesheet order. (A chart created before a
        // mode switch keeps its palette until its next subscription re-create.)
        //
        // This has to be global — dxcharts reads the document root, not the console's
        // subtree — which is why it stays with the app's global baseline rather than moving
        // into the market-data package with the charts themselves. A host embedding
        // market-data into a page with no global `CssBaseline` needs its own equivalent.
        'html:root': {
          '--dx-chart-bg': 'var(--mui-palette-background-paper)',
          '--dx-chart-grid': 'var(--mui-palette-divider)',
          '--dx-chart-axis-label': 'var(--mui-palette-text-secondary)',
          '--dx-chart-axis-label-inverted': 'var(--mui-palette-background-paper)',
          '--dx-chart-axis-label-box': 'var(--mui-palette-text-secondary)',
          '--dx-chart-rect-label-text': 'var(--mui-palette-text-primary)',
          '--dx-chart-rect-label-inverted-text': 'var(--mui-palette-background-paper)',
          '--dx-chart-cross-label-box': 'var(--mui-palette-background-default)',
          '--dx-chart-cross-label-text': 'var(--mui-palette-text-primary)',
        },
      },
    },
    MuiAppBar: {
      defaultProps: {
        elevation: 0,
        color: 'default',
      },
      styleOverrides: {
        root: ({ theme }) => ({
          // "Liquid glass": translucent surface + backdrop blur, so content
          // scrolls underneath with a frosted tint (the MUI-docs app-bar look).
          backgroundColor: 'rgba(255, 255, 255, 0.72)',
          backdropFilter: 'saturate(180%) blur(12px)',
          WebkitBackdropFilter: 'saturate(180%) blur(12px)',
          borderBottom: `1px solid ${theme.palette.divider}`,
          boxShadow: 'none',
          ...theme.applyStyles('dark', {
            backgroundColor: 'rgba(13, 15, 19, 0.72)',
          }),
        }),
      },
    },
  },
})
