import { Effect, Exit, Option, Scope } from 'effect'
import { describe, expect, test } from 'vitest'

import { DXLinkChannelState, DXLinkWebSocketClient } from '@dxfeed/dxlink-api'

import { getSink } from '../live/chartSink'
import { FeedLive, feedLayer } from '../live/service'
import { acquireWired, coalesce, connectWith } from './connect'
import type { Message } from './message'
import type { Model } from './model'
import { init } from './update'

const run = <A>(effect: Effect.Effect<A, never, FeedLive>): Promise<A> =>
  Effect.runPromise(Effect.provide(effect, feedLayer))

const subscriptionsChannel = (channelId: string): Model =>
  init({ channelId, config: { view: 'Subscriptions', feed: '', space: '' } }).model

const chartChannel = (channelId: string): Model =>
  init({ channelId, config: { view: 'Chart', feed: '', space: '' } }).model

/** A real client that is not connected: channels opened on it queue what they are asked for. */
const unconnectedClient = Effect.sync(() => new DXLinkWebSocketClient())

const noClient = Effect.fail('no session')

/** Long enough for one gathered batch of signals to be flushed. */
const flush = Effect.sleep('250 millis')

/**
 * Run `connect` for a channel in a scope of its own, as the console does, and observe the
 * channel while that scope is open and after it is closed.
 */
const connected = <During, After>(
  connect: (
    channel: Model,
    emit: (message: Message) => void
  ) => Effect.Effect<void, never, Scope.Scope | FeedLive>,
  channel: Model,
  whileConnected: Effect.Effect<During, never, FeedLive>,
  afterRelease: Effect.Effect<After, never, FeedLive>
) =>
  Effect.gen(function* () {
    const emitted: Array<Message> = []
    const scope = yield* Scope.make()
    yield* Scope.provide(
      connect(channel, (message) => {
        emitted.push(message)
      }),
      scope
    )
    const during = yield* whileConnected
    yield* Scope.close(scope, Exit.void)
    const after = yield* afterRelease

    return { emitted, during, after }
  })

const handleTagOf = (channelId: string) =>
  Effect.gen(function* () {
    const handles = yield* FeedLive
    const maybeHandle = yield* handles.get(channelId)

    return Option.map(maybeHandle, (handle) => handle._tag)
  })

const hasSink = (channelId: string) => Effect.sync(() => Option.isSome(getSink(channelId)))

describe('connect', () => {
  test('a subscriptions channel holds its feed while connected and releases it with the scope', async () => {
    const result = await run(
      connected(
        connectWith(unconnectedClient),
        subscriptionsChannel('feed-1'),
        Effect.all({ handle: handleTagOf('feed-1'), hasSink: hasSink('feed-1') }),
        handleTagOf('feed-1')
      )
    )

    expect(result.during).toEqual({ handle: Option.some('Feed'), hasSink: false })
    expect(result.after).toEqual(Option.none())
    expect(result.emitted).toHaveLength(1)
    expect(result.emitted[0]).toMatchObject({
      _tag: 'SucceededOpenChannel',
      channelState: DXLinkChannelState.REQUESTED,
    })
  })

  test('a chart channel registers its sink while connected and removes it with the scope', async () => {
    const result = await run(
      connected(
        connectWith(unconnectedClient),
        chartChannel('chart-1'),
        Effect.all({ handle: handleTagOf('chart-1'), hasSink: hasSink('chart-1') }),
        Effect.all({ handle: handleTagOf('chart-1'), hasSink: hasSink('chart-1') })
      )
    )

    expect(result.during).toEqual({ handle: Option.some('Candles'), hasSink: true })
    expect(result.after).toEqual({ handle: Option.none(), hasSink: false })
    expect(result.emitted.map((message) => message._tag)).toEqual(['SucceededOpenChannel'])
  })

  test('the registered sink is the one the handle draws into', async () => {
    const result = await run(
      connected(
        connectWith(unconnectedClient),
        chartChannel('chart-2'),
        Effect.gen(function* () {
          const handles = yield* FeedLive
          const maybeHandle = yield* handles.get('chart-2')

          return Option.exists(
            maybeHandle,
            (handle) =>
              handle._tag === 'Candles' &&
              Option.exists(getSink('chart-2'), (sink) => sink === handle.sink)
          )
        }),
        Effect.void
      )
    )

    expect(result.during).toBe(true)
  })

  test('a failed open is emitted as a Message and leaves nothing behind', async () => {
    const subscriptions = await run(
      connected(
        connectWith(noClient),
        subscriptionsChannel('feed-2'),
        handleTagOf('feed-2'),
        Effect.void
      )
    )
    const chart = await run(
      connected(
        connectWith(noClient),
        chartChannel('chart-3'),
        Effect.all({ handle: handleTagOf('chart-3'), hasSink: hasSink('chart-3') }),
        Effect.void
      )
    )

    expect(subscriptions.during).toEqual(Option.none())
    expect(subscriptions.emitted).toHaveLength(1)
    expect(subscriptions.emitted[0]).toMatchObject({
      _tag: 'FailedOpenChannel',
      error: { type: 'CONSOLE', message: 'Feed channel opened without an active connection' },
    })
    expect(chart.during).toEqual({ handle: Option.none(), hasSink: false })
    expect(chart.emitted).toHaveLength(1)
    expect(chart.emitted[0]).toMatchObject({
      _tag: 'FailedOpenChannel',
      error: { message: 'Feed chart channel opened without an active connection' },
    })
  })

  test('what the channel reports while connected is emitted after the open result', async () => {
    const result = await run(
      connected(
        connectWith(unconnectedClient),
        subscriptionsChannel('feed-3'),
        Effect.gen(function* () {
          const handles = yield* FeedLive
          const maybeHandle = yield* handles.get('feed-3')
          yield* Effect.sync(() => {
            Option.map(maybeHandle, (handle) =>
              handle._tag === 'Feed' ? handle.feed.close() : undefined
            )
          })
          yield* flush
        }),
        Effect.void
      )
    )

    expect(result.emitted.map((message) => message._tag)).toEqual([
      'SucceededOpenChannel',
      'ChangedChannelState',
    ])
    expect(result.emitted[1]).toEqual({
      _tag: 'ChangedChannelState',
      channelState: DXLinkChannelState.CLOSED,
    })
  })
})

describe('coalesce', () => {
  test('merges runs of event signals and keeps other signals in order', () => {
    const quote = { eventType: 'Quote', eventSymbol: 'AAPL' }
    const trade = { eventType: 'Trade', eventSymbol: 'AAPL' }

    expect(
      coalesce([
        { _tag: 'Events', events: [quote] },
        { _tag: 'Events', events: [trade] },
        { _tag: 'Candles', generation: 1, count: 3 },
        { _tag: 'Events', events: [quote] },
      ])
    ).toEqual([
      { _tag: 'Events', events: [quote, trade] },
      { _tag: 'Candles', generation: 1, count: 3 },
      { _tag: 'Events', events: [quote] },
    ])
  })
})

describe('acquireWired', () => {
  test('closes the object it built when wiring it throws', async () => {
    const calls = { closed: 0 }
    const outcome = await Effect.runPromise(
      Effect.flip(
        acquireWired(
          () => 'live',
          () => {
            throw new Error('listener refused')
          },
          () => {
            calls.closed += 1
          }
        )
      )
    )

    expect(outcome).toBe('listener refused')
    expect(calls.closed).toBe(1)
  })

  test('reports the wiring failure even when closing throws as well', async () => {
    const outcome = await Effect.runPromise(
      Effect.flip(
        acquireWired(
          () => 'live',
          () => {
            throw new Error('listener refused')
          },
          () => {
            throw new Error('close refused')
          }
        )
      )
    )

    expect(outcome).toBe('listener refused')
  })

  test('has nothing to close when the object could not be built', async () => {
    const calls = { closed: 0 }
    const outcome = await Effect.runPromise(
      Effect.flip(
        acquireWired(
          (): string => {
            throw new Error('no client')
          },
          (live) => live,
          () => {
            calls.closed += 1
          }
        )
      )
    )

    expect(outcome).toBe('no client')
    expect(calls.closed).toBe(0)
  })

  test('returns what the wiring made and leaves the object open', async () => {
    const calls = { closed: 0 }
    const wired = await Effect.runPromise(
      acquireWired(
        () => 'live',
        (live) => `${live} and wired`,
        () => {
          calls.closed += 1
        }
      )
    )

    expect(wired).toBe('live and wired')
    expect(calls.closed).toBe(0)
  })
})
