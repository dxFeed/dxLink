import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ConnectionProvider } from './connection-context'
import { ConnectionPanel } from './connection-panel'
import { ConnectionViewModel } from './connection-view-model'
import { builtinConsoleConfig } from '../lib/console-config'
import type { ConsoleConfig, ConsoleConfigLock } from '../lib/console-config'
import { ConsoleConfigProvider } from '../lib/console-config-context'

const config = (overrides: Partial<ConsoleConfig> = {}): ConsoleConfig => ({
  ...builtinConsoleConfig(),
  ...overrides,
})

const renderPanel = (value: ConsoleConfig) =>
  render(
    <ConsoleConfigProvider value={value}>
      {/* The panel reads connection state from the page's ViewModel; a fresh one is
          NOT_CONNECTED and opens no socket. */}
      <ConnectionProvider value={new ConnectionViewModel()}>
        <ConnectionPanel />
      </ConnectionProvider>
    </ConsoleConfigProvider>
  )

const urlField = () => screen.getByLabelText(/WebSocket URL/)
const intervalField = () => screen.getByLabelText(/Keepalive interval/)

describe('ConnectionPanel configuration', () => {
  it('starts from the values the profile supplies', () => {
    renderPanel(
      config({
        wsUrl: 'wss://gateway.example.com',
        keepalive: { interval: 5, timeout: 10, acceptTimeout: 15 },
      })
    )

    expect(urlField()).toHaveValue('wss://gateway.example.com')
    expect(intervalField()).toHaveValue('5')
    expect(screen.getByLabelText(/Keepalive timeout/)).toHaveValue('10')
    expect(screen.getByLabelText(/Accept keepalive/)).toHaveValue('15')
  })

  it('leaves an unlocked field editable', () => {
    renderPanel(config({ wsUrl: 'wss://gateway.example.com' }))

    expect(urlField()).toBeEnabled()
    expect(screen.queryByText('Fixed by this deployment.')).not.toBeInTheDocument()
  })

  it('shows a pinned URL read-only rather than hiding it', () => {
    const locked: readonly ConsoleConfigLock[] = ['wsUrl']
    renderPanel(config({ wsUrl: 'wss://gateway.example.com', locked }))

    expect(urlField()).toHaveValue('wss://gateway.example.com')
    expect(urlField()).toBeDisabled()
    expect(screen.getByText('Fixed by this deployment.')).toBeInTheDocument()
  })

  it('pins the keepalive timings as one group, leaving the URL alone', () => {
    renderPanel(config({ locked: ['keepalive'] }))

    expect(intervalField()).toBeDisabled()
    expect(screen.getByLabelText(/Keepalive timeout/)).toBeDisabled()
    expect(screen.getByLabelText(/Accept keepalive/)).toBeDisabled()
    expect(urlField()).toBeEnabled()
  })
})
