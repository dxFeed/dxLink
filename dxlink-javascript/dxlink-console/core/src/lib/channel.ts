import { DXLinkChannelState } from '@dxfeed/dxlink-api'
import type { DXLinkChannel } from '@dxfeed/dxlink-api'
import { useAtomSet, useAtomValue } from '@effect/atom-react'
import { Effect } from 'effect'
import type { Scope } from 'effect'
import * as Atom from 'effect/reactivity/Atom'
import { AtomRegistry } from 'effect/reactivity/AtomRegistry'

import { command, on } from './model'
import { prependError } from './timestamped-error'
import type { TimestampedError } from './timestamped-error'

/**
 * What every channel model has in common: the channel's identity and state, what went wrong on
 * it, and whether the user closed it.
 *
 * Every channel model carries one, and its card header binds to it through
 * {@link useChannelCard}. Keeping it here means one place to change, instead of a copy per
 * service that drifts.
 */
export interface ChannelAtoms {
  readonly state: Atom.Writable<DXLinkChannelState>
  /** Protocol channel id, for correlating with a protocol log. Null until opened. */
  readonly id: Atom.Writable<number | null>
  /**
   * Parameters the channel was actually opened with. Null until opened, and for services that
   * opt out of recording them (see {@link trackChannel}).
   */
  readonly parameters: Atom.Writable<Readonly<Record<string, unknown>> | null>
  /** Errors scoped to THIS channel — connection errors live on the connection model. */
  readonly errors: Atom.Writable<readonly TimestampedError[]>
  /**
   * Whether the user closed the channel. Closing is terminal: a session reads this and holds
   * nothing once it is set, which releases the dxLink object it held.
   */
  readonly closed: Atom.Atom<boolean>
  readonly close: Atom.Writable<void>
  readonly clearErrors: Atom.Writable<void>
}

export const makeChannelAtoms = (): ChannelAtoms => {
  const errors = Atom.make<readonly TimestampedError[]>([])
  const closed = Atom.make(false)

  return {
    state: Atom.make<DXLinkChannelState>(DXLinkChannelState.REQUESTED),
    id: Atom.make<number | null>(null),
    parameters: Atom.make<Readonly<Record<string, unknown>> | null>(null),
    errors,
    closed,
    close: command((ctx) => ctx.set(closed, true)),
    clearErrors: command((ctx) => ctx.set(errors, [])),
  }
}

/** The atoms {@link trackChannel} writes, for a session's `state` list. */
export const channelStateAtoms = (atoms: ChannelAtoms): ReadonlyArray<Atom.Atom<unknown>> => [
  atoms.state,
  atoms.id,
  atoms.parameters,
  atoms.errors,
]

/**
 * Record a freshly opened channel's identity, and follow its state and errors for as long as
 * the calling scope lives.
 *
 * `withParameters: false` skips recording the parameters, for services whose parameters are
 * large and already shown elsewhere (INDICHART carries the source of every indicator).
 *
 * Errors already recorded outlive the scope — they are a log.
 */
export const trackChannel = (
  atoms: ChannelAtoms,
  channel: DXLinkChannel,
  { withParameters = true }: { withParameters?: boolean } = {}
): Effect.Effect<void, never, Scope.Scope | AtomRegistry> =>
  Effect.gen(function* () {
    const registry = yield* AtomRegistry
    registry.set(atoms.id, channel.id)
    if (withParameters) {
      registry.set(atoms.parameters, channel.parameters)
    }
    registry.set(atoms.state, channel.getState())

    yield* on(channel, 'StateChange', (state) => registry.set(atoms.state, state))
    yield* on(channel, 'Error', (error) =>
      registry.update(atoms.errors, (errors) => prependError(errors, error))
    )
  })

/**
 * The parts of a channel card that every channel fills the same way, ready to spread onto
 * `ChannelWidget`.
 */
export const useChannelCard = (atoms: ChannelAtoms) => {
  const close = useAtomSet(atoms.close)
  const clearErrors = useAtomSet(atoms.clearErrors)

  return {
    channelId: useAtomValue(atoms.id),
    parameters: useAtomValue(atoms.parameters),
    errors: useAtomValue(atoms.errors),
    onClearErrors: () => clearErrors(),
    onClose: () => close(),
  }
}
