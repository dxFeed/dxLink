import { DXLinkChannelState } from '@dxfeed/dxlink-api'
import type { DXLinkChannel } from '@dxfeed/dxlink-api'
import { useAtomSet, useAtomValue } from '@effect/atom-react'
import { Effect } from 'effect'
import type { Scope } from 'effect'
import * as Atom from 'effect/reactivity/Atom'
import { AtomRegistry } from 'effect/reactivity/AtomRegistry'

import { command, on, session } from './model'
import type { Session } from './model'
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
   * nothing once it is set, which releases the dxLink object it held; the card reads it too, and
   * stays as a header-only record.
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

/**
 * The atoms {@link trackChannel} writes, for a session's `state` list. {@link channelSession}
 * includes them itself; a model holding something other than a dxLink channel object lists them.
 */
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
 * Hold a channel service's dxLink object open — the session every channel model has.
 *
 * What all of them share is here, so a model states only what is its own:
 *  - nothing is held once the user closes the channel, which releases what was;
 *  - `open` creates the dxLink object and `close` closes it when the session ends;
 *  - the object's protocol channel is followed with {@link trackChannel}, so the card shows its
 *    id, parameters, state and errors;
 *  - those card atoms are kept alive with the model's own `state` — list there every other atom
 *    the session writes, or a value written while no view observes it is dropped;
 *  - `wire` then connects the object's listeners to the model's atoms. It runs in the session's
 *    scope, so everything it registers or forks is released with the session.
 */
export const channelSession = <A, E = never>(
  atoms: ChannelAtoms,
  options: {
    readonly state: ReadonlyArray<Atom.Atom<unknown>>
    readonly open: () => A
    readonly close: (resource: A) => void
    readonly channel: (resource: A) => DXLinkChannel
    /** See {@link trackChannel}. */
    readonly withParameters?: boolean
    readonly wire: (
      resource: A,
      registry: AtomRegistry
    ) => Effect.Effect<void, E, Scope.Scope | AtomRegistry>
  }
): Session<A | null, E> =>
  session({
    state: [...channelStateAtoms(atoms), ...options.state],
    open: (get): Effect.Effect<A | null, E, Scope.Scope | AtomRegistry> => {
      if (get(atoms.closed)) {
        return Effect.succeed(null)
      }

      return Effect.gen(function* () {
        const registry = yield* AtomRegistry
        const resource = yield* Effect.acquireRelease(Effect.sync(options.open), (resource) =>
          Effect.sync(() => options.close(resource))
        )
        yield* trackChannel(atoms, options.channel(resource), {
          withParameters: options.withParameters,
        })
        yield* options.wire(resource, registry)

        return resource
      })
    },
  })

/**
 * The parts of a channel card that every channel fills the same way, ready to spread onto
 * `ChannelWidget` — closed state included, so the card shows what the model holds rather than
 * keeping a second copy of its own.
 */
export const useChannelCard = (atoms: ChannelAtoms) => {
  const close = useAtomSet(atoms.close)
  const clearErrors = useAtomSet(atoms.clearErrors)

  return {
    channelId: useAtomValue(atoms.id),
    parameters: useAtomValue(atoms.parameters),
    errors: useAtomValue(atoms.errors),
    closed: useAtomValue(atoms.closed),
    onClearErrors: () => clearErrors(),
    onClose: () => close(),
  }
}
