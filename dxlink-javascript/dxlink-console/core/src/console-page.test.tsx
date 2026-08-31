import { ThemeProvider, createTheme } from '@mui/material/styles'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ConsolePage } from './console-page'
import { builtinConsoleConfig } from './lib/console-config'
import { createConsoleTheme } from './theme'

// A fresh page is NOT_CONNECTED and opens no socket, so it renders the connection panel
// alone — enough to assert what wraps it.

describe('ConsolePage style boundary', () => {
  it('scopes the MUI reset to its own subtree', () => {
    // The embed hangs on this: a global `CssBaseline` here would repaint the background,
    // colour and font of the host page, which for a docs site means restyling the docs.
    const { container } = render(<ConsolePage config={builtinConsoleConfig()} channels={[]} />)

    expect(container.querySelector('.MuiScopedCssBaseline-root')).not.toBeNull()
    expect(screen.getByLabelText(/WebSocket URL/)).toBeInTheDocument()
  })

  it('inherits a host provider theme when given none', () => {
    // The standalone app's case: its `ThemeProvider` is already above the page, so it passes
    // no theme and its own must reach the console — one theme in the tree, not a second
    // nested inside the first.
    render(
      <ThemeProvider
        theme={createTheme({
          components: { MuiStack: { defaultProps: { className: 'host-theme-probe' } } },
        })}
      >
        <ConsolePage config={builtinConsoleConfig()} channels={[]} />
      </ThemeProvider>
    )

    expect(document.querySelector('.host-theme-probe')).not.toBeNull()
  })

  it('leaves the host document alone when it owns a theme', () => {
    // The failure this pins was live in the browser: MUI's `ThemeProvider` resolves light/dark
    // by reading `localStorage`, then writes the class onto `<html>`. Embedded, that meant a
    // console reading a mode it never stored and flipping the host page dark around it. The
    // host owns the mode; the console reads it off whatever class the host has set.
    localStorage.setItem('mui-mode', 'dark')

    render(
      <ConsolePage config={builtinConsoleConfig()} channels={[]} theme={createConsoleTheme()} />
    )

    expect(document.documentElement.className).toBe('')
    expect(localStorage.getItem('mui-color-scheme')).toBeNull()
  })

  it('provides the theme it is handed', () => {
    // `MuiStack` is a slot the page itself renders, and a component merges a `className`
    // from `defaultProps` with its own — so a class set in the theme is observable proof the
    // theme reached the tree rather than being ignored.
    render(
      <ConsolePage
        config={builtinConsoleConfig()}
        channels={[]}
        theme={createTheme({
          components: { MuiStack: { defaultProps: { className: 'passed-theme-probe' } } },
        })}
      />
    )

    expect(document.querySelector('.passed-theme-probe')).not.toBeNull()
  })
})
