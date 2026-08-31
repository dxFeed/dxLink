import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ChannelsArea } from './channels-area'
import { builtinConsoleConfig } from '../../shared/lib/console-config'
import type { ConsoleConfig } from '../../shared/lib/console-config'
import { ConsoleConfigProvider } from '../../shared/lib/console-config-context'

const renderArea = (overrides: Partial<ConsoleConfig> = {}) =>
  render(
    <ConsoleConfigProvider
      value={{
        ...builtinConsoleConfig({ protocol: 'https:', host: 'demo.dxfeed.com', pathname: '/' }),
        ...overrides,
      }}
    >
      <ChannelsArea />
    </ConsoleConfigProvider>
  )

const addButton = (name: string) => screen.queryByRole('button', { name })

describe('ChannelsArea configuration', () => {
  it('offers every service by default', () => {
    renderArea()

    for (const name of ['Feed', 'DOM', 'IndiChart', 'RPC']) {
      expect(addButton(name)).toBeInTheDocument()
    }
  })

  it('offers only the services the profile declares', () => {
    renderArea({ channelKinds: ['rpc'] })

    expect(addButton('RPC')).toBeInTheDocument()
    for (const name of ['Feed', 'DOM', 'IndiChart']) {
      expect(addButton(name)).not.toBeInTheDocument()
    }
  })

  it('names the offered services in the empty state', () => {
    renderArea({ channelKinds: ['feed', 'rpc'] })

    expect(
      screen.getByText('No channels open. Use the buttons above to open a Feed or RPC channel.')
    ).toBeInTheDocument()
  })

  it('says so plainly when the profile leaves no services', () => {
    renderArea({ channelKinds: [] })

    expect(
      screen.getByText('This console is configured with no channel services.')
    ).toBeInTheDocument()
  })
})
