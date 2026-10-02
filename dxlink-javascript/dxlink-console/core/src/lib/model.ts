import { useAtomValue } from '@effect/atom-react'
import { Cause, Effect, Queue, Stream } from 'effect'
import type { Scope } from 'effect'
import * as AsyncResult from 'effect/reactivity/AsyncResult'
import * as Atom from 'effect/reactivity/Atom'
import type { AtomRegistry } from 'effect/reactivity/AtomRegistry'

/**
 * The primitives a console model is built from.
 *
 * A model wraps one dxLink object — a client, a feed, a chart — as atoms: plain writable atoms
 * for what it shows, {@link command}s for what it does, and one {@link session} that holds the
 * dxLink object open. The session is a scoped Effect, so everything it acquires is released by
 * the scope rather than by a hand-written teardown that has to mirror it.
 */

/**
 * The names `N` for which `T` has an `add${N}Listener` / `remove${N}Listener` pair — the shape
 * every dxLink object uses for what it pushes: `'StateChange'`, `'Error'`, `'Event'`, ….
 */
export type ListenerName<T> = {
  [K in keyof T & string]: K extends `add${infer N}Listener`
    ? `remove${N}Listener` extends keyof T
      ? N
      : never
    : never
}[keyof T & string]

/** The arguments the listener `N` of `T` is called with. */
export type ListenerArgs<T, N extends string> =
  T extends Record<
    `add${N}Listener`,
    (listener: (...args: infer A extends unknown[]) => void) => unknown
  >
    ? A
    : never

type Listener = (...args: unknown[]) => void

const callListenerMethod = (target: object, method: string, listener: Listener): void => {
  // Called as a method of `target`, so implementations that rely on `this` keep working.
  ;(target as Record<string, (listener: Listener) => void>)[method]!(listener)
}

/**
 * Call `f` with whatever `target` pushes through its `name` listener, for as long as the
 * calling scope lives.
 *
 * Registered right here, in the calling fiber. A Stream built with `Stream.callback` would only
 * register once a forked consumer first pulled it — a scheduler tick later — and a channel can
 * be answered within that tick: an OPENED state missed there is never sent again.
 *
 * `f` must not throw into the dxLink dispatch, which does not guard its listeners: a throw would
 * abort the frame for every other channel too. So a failure is reported here and contained.
 */
export const on = <T extends object, N extends ListenerName<T>>(
  target: T,
  name: N,
  f: (...args: ListenerArgs<T, N>) => void
): Effect.Effect<void, never, Scope.Scope> => {
  const listener: Listener = (...args) => {
    try {
      ;(f as Listener)(...args)
    } catch (error) {
      console.error(`dxLink ${name} listener failed`, error)
    }
  }

  return Effect.acquireRelease(
    Effect.sync(() => callListenerMethod(target, `add${name}Listener`, listener)),
    () => Effect.sync(() => callListenerMethod(target, `remove${name}Listener`, listener))
  )
}

/**
 * What `target` pushes through its `name` listener, as a Stream of the listener's arguments.
 *
 * For data that wants stream operators — coalescing above all. The listener is registered
 * immediately (see {@link on}) and buffers into a queue, so the stream can be consumed by a
 * forked fiber without losing what arrives before that fiber first runs.
 */
export const listen = <T extends object, N extends ListenerName<T>>(
  target: T,
  name: N
): Effect.Effect<Stream.Stream<ListenerArgs<T, N>>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<ListenerArgs<T, N>>()
    const enqueue = (...args: unknown[]) => {
      Queue.offerUnsafe(queue, args as ListenerArgs<T, N>)
    }
    yield* on(target, name, enqueue as (...args: ListenerArgs<T, N>) => void)

    return Stream.fromQueue(queue)
  })

/**
 * How often a model flushes high-frequency data into its atoms (~10fps).
 *
 * Feed events, DOM snapshots and RPC responses can arrive far faster than anyone can read them;
 * rendering each would only burn the frame budget. A flush gathers whatever arrived since the
 * last one.
 */
export const FLUSH_INTERVAL = '100 millis'

/** A dxLink object held open by a model, and released with it. */
export interface Session<A, E = never> {
  /** Mount this — {@link useSession} does — to hold the session open. */
  readonly atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>
  /**
   * What the session holds right now, or `undefined` while it holds nothing.
   *
   * For commands. It never opens a session: a command that runs while nothing is open — a test
   * driving a form, say — updates its atoms and leaves the wire alone.
   */
  readonly current: () => A | undefined
}

/**
 * Hold a dxLink object for as long as an atom is in use.
 *
 * `open` is a scoped Effect: the dxLink object it acquires, the listeners it registers and the
 * fibers it forks all belong to the atom's scope, and are released together when the atom is —
 * when the component holding it unmounts, or when an atom `open` read changes (a channel's
 * `closed`, a connection's request), which closes this session and opens the next.
 *
 * That is also what makes it StrictMode-safe without any ceremony: React's mount → unmount →
 * remount happens before the registry gets round to releasing an unobserved atom, so the
 * remount finds the session still open and nothing is opened twice.
 *
 * `state` lists the atoms the session writes to. They are mounted for as long as the session is,
 * because the registry drops an atom nobody observes — and with it, a value written while no view
 * happened to be reading it.
 */
export const session = <A, E = never>(options: {
  readonly state: ReadonlyArray<Atom.Atom<unknown>>
  readonly open: (get: Atom.AtomContext) => Effect.Effect<A, E, Scope.Scope | AtomRegistry>
}): Session<A, E> => {
  let current: A | undefined

  const atom = Atom.make((get) => {
    for (const state of options.state) {
      get.mount(state)
    }

    return options.open(get).pipe(
      Effect.tap((value) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            current = value
          }),
          // The next session may already have published its own value by the time this one's
          // scope closes, so only clear what is still ours.
          () =>
            Effect.sync(() => {
              if (current === value) current = undefined
            })
        )
      )
    )
  })

  return { atom, current: () => current }
}

/**
 * Hold a session open for as long as the calling component is mounted.
 *
 * A session that fails — a dxLink constructor that throws, say — is rethrown here, during
 * render, so the nearest error boundary contains it to the one card that failed.
 *
 * Call it before reading the model's state: opening the session writes that state, and reading
 * it first would only render the initial values once more.
 */
export const useSession = <A, E>(session: Session<A, E>): void => {
  const result = useAtomValue(session.atom)
  if (AsyncResult.isFailure(result)) {
    throw Cause.squash(result.cause)
  }
}

/**
 * A model's command: a write-only atom whose write runs `run`. Views call it through
 * `useAtomSet`.
 *
 * Built on `Atom.writable` rather than `Atom.fnSync` on purpose. A fn atom runs its body the next
 * time it is read, so a command that nothing happened to have mounted would do nothing at all; a
 * write runs on the spot.
 */
export const command = <Arg = void>(
  run: (ctx: Atom.WriteContext<void>, arg: Arg) => void
): Atom.Writable<void, Arg> => Atom.writable(() => undefined, run)
