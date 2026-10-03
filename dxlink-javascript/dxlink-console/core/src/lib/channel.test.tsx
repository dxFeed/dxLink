import type { DXLinkChannelState, DXLinkError } from '@dxfeed/dxlink-api'
import { RegistryContext, RegistryProvider } from '@effect/atom-react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import * as Atom from 'effect/reactivity/Atom'
import * as AtomRegistry from 'effect/reactivity/AtomRegistry'
import { describe, expect, it } from 'vitest'

import { channelSession, makeChannelAtoms, useChannelCard } from './channel'
import { on, useSession } from './model'
import { ChannelWidget } from '../channels/channel-widget'

/** A dxLink-shaped channel object: a protocol channel, plus one listener of its own. */
class FakeService {
  closed = false
  readonly valueListeners = new Set<(value: number) => void>()
  readonly stateListeners = new Set<(state: DXLinkChannelState) => void>()
  readonly errorListeners = new Set<(error: DXLinkError) => void>()
  readonly channel = {
    id: 3,
    parameters: { contract: 'AUTO' },
    getState: () => 'REQUESTED' as DXLinkChannelState,
    addStateChangeListener: (l: (state: DXLinkChannelState) => void) => this.stateListeners.add(l),
    removeStateChangeListener: (l: (state: DXLinkChannelState) => void) =>
      this.stateListeners.delete(l),
    addErrorListener: (l: (error: DXLinkError) => void) => this.errorListeners.add(l),
    removeErrorListener: (l: (error: DXLinkError) => void) => this.errorListeners.delete(l),
  }

  addValueListener(l: (value: number) => void) {
    this.valueListeners.add(l)
  }
  removeValueListener(l: (value: number) => void) {
    this.valueListeners.delete(l)
  }

  get listenerCount() {
    return this.valueListeners.size + this.stateListeners.size + this.errorListeners.size
  }
}

const makeModel = () => {
  const opened: FakeService[] = []
  const channel = makeChannelAtoms()
  const value = Atom.make(0)
  const serviceSession = channelSession(channel, {
    state: [value],
    open: () => {
      const service = new FakeService()
      opened.push(service)
      return service
    },
    close: (service) => {
      service.closed = true
    },
    channel: (service) => service.channel as never,
    wire: (service, registry) => on(service, 'Value', (next) => registry.set(value, next)),
  })

  return { channel, value, session: serviceSession, opened }
}

describe('channelSession', () => {
  it('opens the object, follows its channel and runs its own wiring', () => {
    const registry = AtomRegistry.make()
    const model = makeModel()
    const release = registry.mount(model.session.atom)
    const [service] = model.opened

    expect(model.session.current()).toBe(service)
    expect(registry.get(model.channel.id)).toBe(3)
    expect(registry.get(model.channel.parameters)).toEqual({ contract: 'AUTO' })

    service?.valueListeners.forEach((l) => l(42))
    service?.errorListeners.forEach((l) => l({ type: 'BAD_ACTION', message: 'rejected' }))
    expect(registry.get(model.value)).toBe(42)
    expect(registry.get(model.channel.errors)).toMatchObject([{ message: 'rejected' }])

    release()
    registry.dispose()
  })

  it('closes the object, and every listener, once the channel is closed', () => {
    const registry = AtomRegistry.make()
    const model = makeModel()
    const release = registry.mount(model.session.atom)
    const [service] = model.opened

    registry.set(model.channel.close, undefined)

    expect(service?.closed).toBe(true)
    expect(service?.listenerCount).toBe(0)
    expect(model.session.current()).toBeNull()
    expect(model.opened).toHaveLength(1)

    release()
    registry.dispose()
  })
})

describe('a channel card', () => {
  const Card = ({ model }: { model: ReturnType<typeof makeModel> }) => {
    useSession(model.session)
    const card = useChannelCard(model.channel)

    return (
      <ChannelWidget icon={<span />} title="Test #1" {...card}>
        <div>channel body</div>
      </ChannelWidget>
    )
  }

  it('closes the channel from its close button', () => {
    const model = makeModel()
    render(
      <RegistryProvider>
        <Card model={model} />
      </RegistryProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close channel' }))

    expect(screen.getByText('closed')).toBeInTheDocument()
    expect(screen.queryByText('channel body')).not.toBeInTheDocument()
    expect(model.opened[0]?.closed).toBe(true)
  })

  it('shows a channel closed by any other route as closed too', () => {
    // The card used to keep its own closed flag, so a channel closed through its model left the
    // card open, with live controls, over a channel that no longer existed.
    const model = makeModel()
    const registry = AtomRegistry.make()
    render(
      <RegistryContext.Provider value={registry}>
        <Card model={model} />
      </RegistryContext.Provider>
    )

    act(() => registry.set(model.channel.close, undefined))

    expect(screen.getByText('closed')).toBeInTheDocument()
    expect(screen.queryByText('channel body')).not.toBeInTheDocument()
    expect(model.opened[0]?.closed).toBe(true)
  })
})
