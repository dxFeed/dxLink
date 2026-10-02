import { RegistryProvider, useAtomSet, useAtomValue } from '@effect/atom-react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { Effect, Stream } from 'effect'
import * as AsyncResult from 'effect/reactivity/AsyncResult'
import * as Atom from 'effect/reactivity/Atom'
import * as AtomRegistry from 'effect/reactivity/AtomRegistry'
import { StrictMode } from 'react'
import { describe, expect, it } from 'vitest'

import { command, FLUSH_INTERVAL, listen, on, session, useSession } from './model'

/** The listener shape every dxLink object has, with one listener kind. */
class FakeTicker {
  readonly listeners = new Set<(value: number, previous: number) => void>()
  addTickListener(listener: (value: number, previous: number) => void) {
    this.listeners.add(listener)
  }
  removeTickListener(listener: (value: number, previous: number) => void) {
    this.listeners.delete(listener)
  }
  tick(value: number) {
    for (const listener of this.listeners) listener(value, value - 1)
  }
}

/** A model over a ticker, built the way the channel models are. */
const makeTickerModel = (ticker: FakeTicker) => {
  const closed = Atom.make(false)
  const latest = Atom.make(0)
  const batches = Atom.make<readonly number[][]>([])
  const log: string[] = []

  const tickerSession = session({
    state: [latest, batches],
    open: (get) => {
      if (get(closed)) return Effect.succeed(null)

      return Effect.gen(function* () {
        const registry = yield* AtomRegistry.AtomRegistry
        const held = yield* Effect.acquireRelease(
          Effect.sync(() => (log.push('open'), ticker)),
          () => Effect.sync(() => log.push('close'))
        )
        yield* on(held, 'Tick', (value) => registry.set(latest, value))
        const ticks = yield* listen(held, 'Tick')
        yield* ticks.pipe(
          Stream.groupedWithin(Number.POSITIVE_INFINITY, FLUSH_INTERVAL),
          Stream.runForEach((group) =>
            Atom.update(batches, (current) => [...current, group.map(([value]) => value)])
          ),
          Effect.forkScoped
        )

        return held
      })
    },
  })

  return {
    session: tickerSession,
    closed,
    latest,
    batches,
    log,
    close: command((ctx) => ctx.set(closed, true)),
  }
}

describe('on', () => {
  it('registers in the calling fiber and removes the listener with the scope', () => {
    const ticker = new FakeTicker()
    const seen: Array<[number, number]> = []

    Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          yield* on(ticker, 'Tick', (value, previous) => seen.push([value, previous]))
          // Nothing has yielded since `on` returned: the listener is already there.
          ticker.tick(1)
          expect(ticker.listeners.size).toBe(1)
        })
      )
    )

    expect(seen).toEqual([[1, 0]])
    expect(ticker.listeners.size).toBe(0)
  })

  it('keeps a failing callback out of the dispatch', () => {
    const ticker = new FakeTicker()
    const after: number[] = []
    const consoleError = console.error
    console.error = () => undefined

    try {
      Effect.runSync(
        Effect.scoped(
          Effect.gen(function* () {
            yield* on(ticker, 'Tick', () => {
              throw new Error('boom')
            })
            ticker.addTickListener((value) => after.push(value))
            expect(() => ticker.tick(1)).not.toThrow()
          })
        )
      )
    } finally {
      console.error = consoleError
    }

    // A listener dispatched after the failing one still heard the tick.
    expect(after).toEqual([1])
  })
})

describe('session', () => {
  it('opens synchronously, and drains a coalesced stream into its atoms', async () => {
    const registry = AtomRegistry.make()
    const ticker = new FakeTicker()
    const model = makeTickerModel(ticker)

    const release = registry.mount(model.session.atom)
    expect(AsyncResult.isSuccess(registry.get(model.session.atom))).toBe(true)
    expect(model.session.current()).toBe(ticker)

    ticker.tick(1)
    ticker.tick(2)
    ticker.tick(3)
    // The plain listener is synchronous; the coalesced one waits for its window.
    expect(registry.get(model.latest)).toBe(3)
    expect(registry.get(model.batches)).toEqual([])

    await waitFor(() => expect(registry.get(model.batches)).toEqual([[1, 2, 3]]))

    release()
    registry.dispose()
  })

  it('closes when an atom it read changes, releasing everything it acquired', () => {
    const registry = AtomRegistry.make()
    const ticker = new FakeTicker()
    const model = makeTickerModel(ticker)
    const release = registry.mount(model.session.atom)

    expect(ticker.listeners.size).toBe(2)
    registry.set(model.close, undefined)

    expect(model.log).toEqual(['open', 'close'])
    expect(ticker.listeners.size).toBe(0)
    expect(model.session.current()).toBeNull()
    // What the session wrote outlives it.
    ticker.tick(9)
    expect(registry.get(model.latest)).toBe(0)

    release()
    registry.dispose()
  })

  it('opens once under StrictMode, and closes once the component is gone', async () => {
    const ticker = new FakeTicker()
    const model = makeTickerModel(ticker)
    const View = () => {
      useSession(model.session)
      return <span>{useAtomValue(model.latest)}</span>
    }

    const { unmount } = render(
      <StrictMode>
        <RegistryProvider defaultIdleTTL={50}>
          <View />
        </RegistryProvider>
      </StrictMode>
    )

    expect(model.log).toEqual(['open'])
    act(() => ticker.tick(5))
    expect(screen.getByText('5')).toBeInTheDocument()

    unmount()
    await waitFor(() => expect(model.log).toEqual(['open', 'close']))
    expect(ticker.listeners.size).toBe(0)
  })

  it('rethrows a session that failed to open, for the error boundary', () => {
    const failing = session({
      state: [],
      open: () =>
        Effect.sync(() => {
          throw new Error('cannot open')
        }),
    })
    const View = () => {
      useSession(failing)
      return null
    }
    const consoleError = console.error
    console.error = () => undefined

    try {
      expect(() =>
        render(
          <RegistryProvider>
            <View />
          </RegistryProvider>
        )
      ).toThrow('cannot open')
    } finally {
      console.error = consoleError
    }
  })
})

describe('command', () => {
  it('runs on write, whether or not anything has it mounted', () => {
    const registry = AtomRegistry.make()
    const count = Atom.make(0)
    const add = command((ctx, by: number) => ctx.set(count, ctx.get(count) + by))

    registry.set(add, 2)
    registry.set(add, 3)

    expect(registry.get(count)).toBe(5)
    registry.dispose()
  })

  it('is callable from a component through useAtomSet', () => {
    const count = Atom.make(0)
    const increment = command((ctx) => ctx.set(count, ctx.get(count) + 1))
    const View = () => {
      const run = useAtomSet(increment)
      return <button onClick={() => run()}>{useAtomValue(count)}</button>
    }

    render(
      <RegistryProvider>
        <View />
      </RegistryProvider>
    )
    act(() => screen.getByRole('button').click())

    expect(screen.getByRole('button')).toHaveTextContent('1')
  })
})
