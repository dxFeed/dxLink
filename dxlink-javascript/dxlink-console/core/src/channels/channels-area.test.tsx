import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ChannelsArea } from './channels-area'
import { defineChannelPlugin } from './plugin'
import type { ErasedChannelPlugin } from './plugin'
import { builtinConsoleConfig } from '../lib/console-config'
import type { ConsoleConfig } from '../lib/console-config'
import { ConsoleConfigProvider } from '../lib/console-config-context'

// The area is tested against fake plugins rather than the four real services. That is the
// point of the registry: it has no knowledge of FEED, DOM, INDICHART or RPC, so nothing
// here needs a chart, an editor or a descriptor set to exercise every path.

interface FakeValue {
  value: string
}

interface FakeOptions {
  kind: string
  label: string
  canOpen?: (request: FakeValue) => boolean
  buildConfig?: (request: FakeValue) => FakeValue | null
}

const fakePlugin = ({ kind, label, canOpen, buildConfig }: FakeOptions): ErasedChannelPlugin =>
  defineChannelPlugin<FakeValue, FakeValue>({
    kind,
    label,
    icon: null,
    dialogTitle: `New ${label} channel`,
    createRequest: () => ({ value: 'seed' }),
    RequestForm: ({ value, onChange }) => (
      <input
        aria-label={`${label} value`}
        value={value.value}
        onChange={(event) => onChange({ value: event.target.value })}
      />
    ),
    canOpen,
    buildConfig: buildConfig ?? ((request) => ({ value: request.value })),
    Channel: ({ title, config }) => <div>{`${title} carries ${config.value}`}</div>,
  })

const foo = fakePlugin({ kind: 'feed', label: 'Foo' })
const bar = fakePlugin({ kind: 'rpc', label: 'Bar' })

const renderArea = (
  channels: readonly ErasedChannelPlugin[] = [foo, bar],
  overrides: Partial<ConsoleConfig> = {}
) =>
  render(
    <ConsoleConfigProvider
      value={{
        ...builtinConsoleConfig(),
        ...overrides,
      }}
    >
      <ChannelsArea channels={channels} />
    </ConsoleConfigProvider>
  )

const addButton = (name: string) => screen.queryByRole('button', { name })
const openButton = () => screen.getByRole('button', { name: 'Open channel' })

/**
 * Click a dialog button and wait for the dialog to actually leave the DOM.
 *
 * MUI keeps the dialog mounted through its closing transition, and while it is mounted its
 * `aria-modal` hides everything behind it from the accessibility tree — so the add-buttons
 * and any open channel are unqueryable until the transition finishes.
 */
const clickAndClose = async (name: string) => {
  fireEvent.click(screen.getByRole('button', { name }))
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
}

describe('ChannelsArea registry', () => {
  it('offers an add-button per registered plugin, in order', () => {
    renderArea()

    expect(addButton('Foo')).toBeInTheDocument()
    expect(addButton('Bar')).toBeInTheDocument()
  })

  it('offers nothing for a plugin that was never registered', () => {
    renderArea([foo])

    expect(addButton('Foo')).toBeInTheDocument()
    expect(addButton('Bar')).not.toBeInTheDocument()
  })

  it('opens the plugin dialog with its own title and form, seeded from createRequest', () => {
    renderArea()
    fireEvent.click(screen.getByRole('button', { name: 'Foo' }))

    expect(screen.getByText('New Foo channel')).toBeInTheDocument()
    expect(screen.getByLabelText('Foo value')).toHaveValue('seed')
  })

  it('keeps each request value between opens, per plugin', async () => {
    renderArea()

    fireEvent.click(screen.getByRole('button', { name: 'Foo' }))
    fireEvent.change(screen.getByLabelText('Foo value'), { target: { value: 'edited' } })
    await clickAndClose('Cancel')

    // Bar's request must be untouched by Foo's edit.
    fireEvent.click(screen.getByRole('button', { name: 'Bar' }))
    expect(screen.getByLabelText('Bar value')).toHaveValue('seed')
    await clickAndClose('Cancel')

    fireEvent.click(screen.getByRole('button', { name: 'Foo' }))
    expect(screen.getByLabelText('Foo value')).toHaveValue('edited')
  })

  it('opens a channel and renders it through the plugin', async () => {
    renderArea()
    fireEvent.click(screen.getByRole('button', { name: 'Foo' }))
    fireEvent.change(screen.getByLabelText('Foo value'), { target: { value: 'payload' } })
    await clickAndClose('Open channel')

    expect(screen.getByText('Foo #1 carries payload')).toBeInTheDocument()
  })

  it('gates Open channel on the plugin canOpen', () => {
    renderArea([fakePlugin({ kind: 'feed', label: 'Foo', canOpen: (r) => r.value === 'ready' })])
    fireEvent.click(screen.getByRole('button', { name: 'Foo' }))

    expect(openButton()).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Foo value'), { target: { value: 'ready' } })
    expect(openButton()).toBeEnabled()
  })

  it('opens nothing when buildConfig cannot produce a config', () => {
    renderArea([fakePlugin({ kind: 'feed', label: 'Foo', buildConfig: () => null })])
    fireEvent.click(screen.getByRole('button', { name: 'Foo' }))
    fireEvent.click(openButton())

    // The dialog stays open rather than opening a broken channel.
    expect(screen.getByText('New Foo channel')).toBeInTheDocument()
    expect(screen.queryByText(/carries/)).not.toBeInTheDocument()
  })
})

describe('ChannelsArea configuration', () => {
  it('offers every registered service by default', () => {
    renderArea()

    expect(addButton('Foo')).toBeInTheDocument()
    expect(addButton('Bar')).toBeInTheDocument()
  })

  it('offers only the services the profile declares', () => {
    renderArea([foo, bar], { channelKinds: ['rpc'] })

    expect(addButton('Bar')).toBeInTheDocument()
    expect(addButton('Foo')).not.toBeInTheDocument()
  })

  it('orders add-buttons by registration, not by the profile', () => {
    // `channelKinds` is a set, not a sequence: it says which services are offered, and the
    // registered plugins say in what order they appear. Ordering it has no effect.
    const baz = fakePlugin({ kind: 'dom', label: 'Baz' })
    renderArea([foo, bar, baz], { channelKinds: ['dom', 'rpc', 'feed'] })

    const offered = screen
      .getAllByRole('button')
      .map((button) => button.textContent)
      .filter((label) => label === 'Foo' || label === 'Bar' || label === 'Baz')

    expect(offered).toEqual(['Foo', 'Bar', 'Baz'])
  })

  it('names the offered services in the empty state', () => {
    renderArea()

    expect(
      screen.getByText('No channels open. Use the buttons above to open a Foo or Bar channel.')
    ).toBeInTheDocument()
  })

  it('agrees the article with the first label, by sound rather than spelling', () => {
    // An acronym read letter-by-letter takes "an" even though R is a consonant; a label read
    // as a word goes by its first letter. Both cases are real: RPC and DOM.
    renderArea([fakePlugin({ kind: 'rpc', label: 'RPC' })])
    expect(
      screen.getByText('No channels open. Use the buttons above to open an RPC channel.')
    ).toBeInTheDocument()
  })

  it('keeps "a" for an acronym read as a word', () => {
    renderArea([fakePlugin({ kind: 'dom', label: 'DOM' })])
    expect(
      screen.getByText('No channels open. Use the buttons above to open a DOM channel.')
    ).toBeInTheDocument()
  })

  it('uses "an" for a vowel-initial word label', () => {
    renderArea([fakePlugin({ kind: 'indichart', label: 'IndiChart' })])
    expect(
      screen.getByText('No channels open. Use the buttons above to open an IndiChart channel.')
    ).toBeInTheDocument()
  })

  it('says so plainly when the profile leaves no services', () => {
    renderArea([foo, bar], { channelKinds: [] })

    expect(
      screen.getByText('This console is configured with no channel services.')
    ).toBeInTheDocument()
  })

  it('keeps an open channel rendered after the profile stops offering its kind', async () => {
    const { rerender } = renderArea()
    fireEvent.click(screen.getByRole('button', { name: 'Foo' }))
    await clickAndClose('Open channel')

    rerender(
      <ConsoleConfigProvider
        value={{
          ...builtinConsoleConfig(),
          channelKinds: ['rpc'],
        }}
      >
        <ChannelsArea channels={[foo, bar]} />
      </ConsoleConfigProvider>
    )

    expect(addButton('Foo')).not.toBeInTheDocument()
    expect(screen.getByText('Foo #1 carries seed')).toBeInTheDocument()
  })
})
