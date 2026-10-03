import { RegistryContext } from '@effect/atom-react'
import { Cause, Effect, Queue } from 'effect'
import type { Scope } from 'effect'
import * as AsyncResult from 'effect/reactivity/AsyncResult'
import * as Atom from 'effect/reactivity/Atom'
import type { AtomRegistry } from 'effect/reactivity/AtomRegistry'
import { useContext, useEffect, useState } from 'react'

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
 * How long a model gathers high-frequency data before writing it to its atoms (~10fps).
 *
 * Feed events, DOM snapshots and RPC responses can arrive far faster than anyone can read them;
 * rendering each would only burn the frame budget.
 */
export const FLUSH_INTERVAL = '100 millis'

/**
 * Hand what `subscribe` delivers to `f` in windows, for as long as the calling scope lives.
 *
 * The first value after a quiet spell opens a window, and everything that arrives within
 * {@link FLUSH_INTERVAL} of it goes to `f` together, in order. Nothing is scheduled while
 * nothing arrives, so an idle channel costs no timer. `latest: true` keeps only the newest value
 * of a window — for full replacements, such as a DOM snapshot, where holding the rest would only
 * be to throw them away.
 *
 * `subscribe` runs in the calling fiber and its values are buffered, so the forked loop loses
 * nothing that arrives before it first runs (see {@link on} for why that matters).
 */
export const coalesce = <A, R = never>(
  subscribe: (emit: (value: A) => void) => Effect.Effect<void, never, Scope.Scope>,
  f: (batch: ReadonlyArray<A>) => Effect.Effect<void, never, R>,
  options: { readonly latest?: boolean } = {}
): Effect.Effect<void, never, Scope.Scope | R> =>
  Effect.gen(function* () {
    const queue = yield* options.latest ? Queue.sliding<A>(1) : Queue.unbounded<A>()
    yield* subscribe((value) => {
      Queue.offerUnsafe(queue, value)
    })

    yield* Effect.gen(function* () {
      // Waits, with no timer, for the value that opens the next window.
      const opening = yield* Queue.takeAll(queue)
      yield* Effect.sleep(FLUSH_INTERVAL)
      const rest = yield* Queue.clear(queue)
      // A defect in `f` is reported and contained to this window, as `on` does for a listener:
      // left to escape, it would end the loop silently — a forked fiber's failure goes nowhere —
      // and the model would stop updating for good.
      yield* f([...opening, ...rest]).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.failCause(cause)
            : Effect.sync(() => console.error('dxLink batch handler failed', Cause.squash(cause)))
        )
      )
    }).pipe(Effect.forever, Effect.forkScoped)
  })

/**
 * {@link coalesce} over a dxLink listener: `f` receives each window's notifications, as the
 * listener's argument lists.
 */
export const onBatch = <T extends object, N extends ListenerName<T>, R = never>(
  target: T,
  name: N,
  f: (batch: ReadonlyArray<ListenerArgs<T, N>>) => Effect.Effect<void, never, R>,
  options?: { readonly latest?: boolean }
): Effect.Effect<void, never, Scope.Scope | R> =>
  coalesce<ListenerArgs<T, N>, R>(
    (emit) =>
      on(target, name, ((...args: unknown[]) => emit(args as ListenerArgs<T, N>)) as (
        ...args: ListenerArgs<T, N>
      ) => void),
    f,
    options
  )

/** A dxLink object held open by a model, and released with it. */
export interface Session<A, E = never> {
  /** Mount this — {@link useSession} does — to hold the session open. */
  readonly atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>
  /**
   * What the open session holds right now: `undefined` while no session is open, otherwise
   * whatever `open` produced — which for a closed channel is `null`, so commands guard with
   * `?.` and cover both.
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
 * The session opens when the component commits, not while it renders: a render React discards —
 * an interrupted concurrent render, a sibling hook that throws — must not put a channel on the
 * wire that nothing then holds. The model's atoms render their initial values until it does.
 *
 * A session that fails — a dxLink constructor that throws, say — is rethrown on the next render,
 * so the nearest error boundary contains it to the one card that failed.
 */
export const useSession = <A, E>(session: Session<A, E>): void => {
  const registry = useContext(RegistryContext)
  const [failure, setFailure] = useState<Cause.Cause<E> | null>(null)

  useEffect(
    () =>
      registry.subscribe(
        session.atom,
        (result) => setFailure(AsyncResult.isFailure(result) ? result.cause : null),
        { immediate: true }
      ),
    [registry, session]
  )

  if (failure !== null) {
    throw Cause.squash(failure)
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
