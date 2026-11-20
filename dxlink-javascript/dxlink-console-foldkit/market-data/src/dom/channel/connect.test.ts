import { Effect, Exit, Option, Queue, Scope } from 'effect'
import { describe, expect, test } from 'vitest'

import {
  type DXLinkChannel,
  type DXLinkChannelMessage,
  type DXLinkChannelMessageListener,
  DXLinkChannelState,
  type DXLinkChannelStateChangeListener,
  type DXLinkError,
  type DXLinkErrorListener,
  DXLinkWebSocketClient,
} from '@dxfeed/dxlink-api'

import { DomHandles, domLayer } from '../service'
import { DomEvent, acquireHandle, coalesceSnapshots, connectWith, forwardEvents } from './connect'
import { Message } from './message'
import { init } from './update'

const snapshotEvent = (time: number) =>
  DomEvent.Snapshot({ snapshot: { time, bids: [], asks: [] } })

const snapshotMessage = (time: number) =>
  Message.ReceivedSnapshot({ snapshot: { time, bids: [], asks: [] } })

const channelModel = init({
  channelId: '7',
  config: { symbol: 'AAPL', source: 'ntv, glbx', feed: '', space: '' },
}).model

/** Longer than one batching window, so everything offered before it has been emitted. */
const settle = Effect.sleep('250 millis')

const run = <A>(effect: Effect.Effect<A, never, DomHandles>): Promise<A> =>
  Effect.runPromise(Effect.provide(effect, domLayer))

/**
 * The server's end of one protocol channel, with no connection behind it: it keeps the
 * listeners the client's end attached, so a test can speak for the server and see what is
 * still listening.
 *
 * `rejectsConsoleListener` lets the client's own error listener attach, which it does while
 * the channel is constructed, and throws on the next one: the one the console attaches.
 */
const makeServer = (
  options: Readonly<{ rejectsConsoleListener: boolean }> = { rejectsConsoleListener: false }
) => {
  const messageListeners = new Set<DXLinkChannelMessageListener>()
  const stateListeners = new Set<DXLinkChannelStateChangeListener>()
  const errorListeners = new Set<DXLinkErrorListener>()
  const opened: Array<Readonly<{ service: string; parameters: Record<string, unknown> }>> = []
  const closes: Array<string> = []

  const makeChannel = (service: string, parameters: Record<string, unknown>): DXLinkChannel => ({
    id: 3,
    service,
    parameters,
    send: () => {},
    addMessageListener: (listener) => {
      messageListeners.add(listener)
    },
    removeMessageListener: (listener) => {
      messageListeners.delete(listener)
    },
    getState: () => DXLinkChannelState.REQUESTED,
    addStateChangeListener: (listener) => {
      stateListeners.add(listener)
    },
    removeStateChangeListener: (listener) => {
      stateListeners.delete(listener)
    },
    addErrorListener: (listener) => {
      if (options.rejectsConsoleListener && errorListeners.size > 0) {
        throw new Error('cannot listen')
      }
      errorListeners.add(listener)
    },
    removeErrorListener: (listener) => {
      errorListeners.delete(listener)
    },
    close: () => {
      closes.push('closed')
    },
  })

  const client = new DXLinkWebSocketClient()
  client.openChannel = (service, parameters) => {
    opened.push({ service, parameters })

    return makeChannel(service, parameters)
  }

  return {
    client,
    opened,
    closes,
    send: (message: DXLinkChannelMessage) => {
      messageListeners.forEach((listener) => listener(message))
    },
    changeState: (state: DXLinkChannelState) => {
      stateListeners.forEach((listener) => listener(state, DXLinkChannelState.REQUESTED))
    },
    fail: (error: DXLinkError) => {
      errorListeners.forEach((listener) => listener(error))
    },
  }
}

const snapshotFromServer = (time: number): DXLinkChannelMessage => ({
  type: 'DOM_SNAPSHOT',
  time,
  bids: [{ price: time, size: 1 }],
  asks: [],
})

/** Run the live side of the channel in a scope the test closes itself. */
const connected = <A>(
  server: ReturnType<typeof makeServer>,
  emitted: Array<Message>,
  whileConnected: (scope: Scope.Closeable) => Effect.Effect<A, never, DomHandles>
): Effect.Effect<A, never, DomHandles> =>
  Effect.gen(function* () {
    const scope = yield* Scope.make()
    yield* Scope.provide(
      connectWith(server.client, channelModel, (message) => {
        emitted.push(message)
      }),
      scope
    )
    const result = yield* whileConnected(scope)
    yield* Scope.close(scope, Exit.void)

    return result
  })

describe('coalesceSnapshots', () => {
  test('keeps only the latest snapshot', () => {
    expect(coalesceSnapshots([snapshotEvent(10), snapshotEvent(11), snapshotEvent(12)])).toEqual([
      snapshotEvent(12),
    ])
  })

  test('everything that is not a snapshot keeps its place', () => {
    const opened = DomEvent.ChangedState({ channelState: DXLinkChannelState.OPENED })
    const failed = DomEvent.Failed({ type: 'BAD_ACTION', message: 'no' })

    expect(coalesceSnapshots([opened, snapshotEvent(10), failed, snapshotEvent(11)])).toEqual([
      opened,
      failed,
      snapshotEvent(11),
    ])
  })
})

describe('forwardEvents', () => {
  test('one window of events is emitted once, with the latest snapshot and stamped errors', async () => {
    const emitted: Array<Message> = []

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const events = yield* Queue.unbounded<DomEvent>()
          yield* Effect.forkScoped(
            forwardEvents(events, (message) => {
              emitted.push(message)
            })
          )

          yield* Queue.offerAll(events, [
            snapshotEvent(1),
            DomEvent.ChangedState({ channelState: DXLinkChannelState.OPENED }),
            snapshotEvent(2),
            DomEvent.Failed({ type: 'BAD_ACTION', message: 'no' }),
            snapshotEvent(3),
          ])
          expect(emitted).toEqual([])
          yield* settle
        })
      )
    )

    expect(emitted).toEqual([
      Message.ChangedChannelState({ channelState: DXLinkChannelState.OPENED }),
      {
        _tag: 'ReportedChannelError',
        error: { type: 'BAD_ACTION', message: 'no', time: expect.any(String) },
      },
      snapshotMessage(3),
    ])
  })

  test('snapshots of separate windows are each emitted', async () => {
    const emitted: Array<Message> = []

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const events = yield* Queue.unbounded<DomEvent>()
          yield* Effect.forkScoped(
            forwardEvents(events, (message) => {
              emitted.push(message)
            })
          )

          yield* Queue.offer(events, snapshotEvent(1))
          yield* settle
          yield* Queue.offer(events, snapshotEvent(2))
          yield* settle
        })
      )
    )

    expect(emitted).toEqual([snapshotMessage(1), snapshotMessage(2)])
  })
})

describe('acquireHandle', () => {
  test('an open that fails registers nothing and leaves nothing to release', async () => {
    const result = await run(
      Effect.gen(function* () {
        const handles = yield* DomHandles
        const exit = yield* Effect.exit(
          Effect.scoped(acquireHandle(handles, '7', Effect.fail('no channel')))
        )

        return { exit, maybeHandle: yield* handles.get('7') }
      })
    )

    expect(result.exit).toEqual(Exit.fail('no channel'))
    expect(result.maybeHandle).toEqual(Option.none())
  })
})

describe('connectWith', () => {
  test('opens the channel the card asks for and reports what it opened', async () => {
    const server = makeServer()
    const emitted: Array<Message> = []

    await run(connected(server, emitted, () => Effect.void))

    expect(server.opened).toEqual([
      {
        service: 'DOM',
        parameters: { symbol: 'AAPL', sources: ['ntv', 'glbx'], space: undefined, feed: undefined },
      },
    ])
    expect(emitted).toEqual([
      Message.SucceededOpenDomChannel({
        protocolChannelId: 3,
        parameters: { symbol: 'AAPL', sources: 'ntv, glbx' },
        channelState: DXLinkChannelState.REQUESTED,
        applied: {
          maybeAggregationPeriod: Option.none(),
          maybeDepthLimit: Option.none(),
          dataFormat: 'FULL',
          orderFields: [],
        },
      }),
    ])
  })

  test('the handle is registered while connected and gone once the scope closes', async () => {
    const server = makeServer()

    const result = await run(
      Effect.gen(function* () {
        const handles = yield* DomHandles
        const whileConnected = yield* connected(server, [], () =>
          Effect.gen(function* () {
            const maybeHandle = yield* handles.get('7')

            return { maybeHandle, closes: server.closes.length }
          })
        )

        return { whileConnected, afterwards: yield* handles.get('7') }
      })
    )

    expect(Option.isSome(result.whileConnected.maybeHandle)).toBe(true)
    expect(result.whileConnected.closes).toBe(0)
    expect(result.afterwards).toEqual(Option.none())
    expect(server.closes).toEqual(['closed'])
  })

  test('snapshots the server sends within one window reach the Model as the latest one', async () => {
    const server = makeServer()
    const emitted: Array<Message> = []

    await run(
      connected(server, emitted, () =>
        Effect.gen(function* () {
          yield* Effect.sync(() => {
            server.send(snapshotFromServer(1))
            server.send(snapshotFromServer(2))
            server.changeState(DXLinkChannelState.OPENED)
            server.fail({ type: 'BAD_ACTION', message: 'no' })
            server.send(snapshotFromServer(3))
          })
          yield* settle
        })
      )
    )

    expect(emitted.map((message) => message._tag)).toEqual([
      'SucceededOpenDomChannel',
      'ChangedChannelState',
      'ReportedChannelError',
      'ReceivedSnapshot',
    ])
    expect(emitted[3]).toEqual(
      Message.ReceivedSnapshot({
        snapshot: { time: 3, bids: [{ price: 3, maybeSize: Option.some(1) }], asks: [] },
      })
    )
  })

  test('nothing the server sends after the scope closed is emitted', async () => {
    const server = makeServer()
    const emitted: Array<Message> = []

    await run(
      Effect.gen(function* () {
        yield* connected(server, emitted, () => Effect.void)
        yield* Effect.sync(() => {
          server.send(snapshotFromServer(1))
          server.changeState(DXLinkChannelState.OPENED)
          server.fail({ type: 'BAD_ACTION', message: 'no' })
        })
        yield* settle
      })
    )

    expect(emitted.map((message) => message._tag)).toEqual(['SucceededOpenDomChannel'])
  })

  test('a channel that cannot be listened to is closed at once and reported as a failed open', async () => {
    const server = makeServer({ rejectsConsoleListener: true })
    const emitted: Array<Message> = []

    const result = await run(
      Effect.gen(function* () {
        const handles = yield* DomHandles

        return yield* connected(server, emitted, () =>
          Effect.gen(function* () {
            const maybeHandle = yield* handles.get('7')

            return { maybeHandle, closes: server.closes.length }
          })
        )
      })
    )

    expect(emitted).toEqual([
      {
        _tag: 'FailedOpenDomChannel',
        error: { type: 'UNKNOWN', message: 'cannot listen', time: expect.any(String) },
      },
    ])
    expect(result.maybeHandle).toEqual(Option.none())
    expect(result.closes).toBe(1)
    expect(server.closes).toEqual(['closed'])
  })

  test('a channel the client refuses to open is reported as a failed open', async () => {
    const server = makeServer()
    server.client.openChannel = () => {
      throw new Error('not connected')
    }
    const emitted: Array<Message> = []

    await run(connected(server, emitted, () => Effect.void))

    expect(emitted).toEqual([
      {
        _tag: 'FailedOpenDomChannel',
        error: { type: 'UNKNOWN', message: 'not connected', time: expect.any(String) },
      },
    ])
    expect(server.closes).toEqual([])
  })
})
