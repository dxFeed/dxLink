import { createTheme } from '@mui/material/styles'

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
 * App theme. Stock MUI components throughout — the polished, "MUI-docs-grade"
 * look comes entirely from the theme (palette, typography, shape) plus a few
 * component style overrides (notably the translucent "liquid glass" app bar),
 * never from bespoke components.
 *
 * Light + dark color schemes follow the OS by default (`defaultMode="system"`
 * on the provider); `cssVariables` with a class selector lets
 * `InitColorSchemeScript` apply the stored scheme before first paint.
 * Scheme-specific styles inside overrides use `theme.applyStyles('dark', …)`.
 */
export const theme = createTheme({
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
    fontFamily: FONT_FAMILY,
    h1: { fontWeight: 700, letterSpacing: '-0.02em' },
    h2: { fontWeight: 700, letterSpacing: '-0.02em' },
    h3: { fontWeight: 700, letterSpacing: '-0.015em' },
    h4: { fontWeight: 700, letterSpacing: '-0.01em' },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { fontWeight: 600, textTransform: 'none' },
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
    // Compact dropdowns: Select menus open dense, matching the `size="small"`
    // inputs they belong to. The app has no app-level menus (nav is buttons),
    // so this effectively scopes to Select popovers.
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
})
