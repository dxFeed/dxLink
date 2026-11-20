import { Effect, Exit, Option, Scope } from 'effect'
import { describe, expect, test } from 'vitest'

import { type CallEvent, unknownFailure } from '../call'
import type { Config } from '../request'
import { REGISTRY_NOT_RETAINED, RpcHandles } from '../service'
import { loadRegistry, run } from '../testing.fixture'
import { type CallTransport, makeConnect, toMessages } from './connect'
import { Message } from './message'
import { type Model, openingModel } from './model'

const channel = (channelId: string, registryId: number): Model => {
  const config: Config = {
    registryId,
    serviceName: 'demo.v1.OrderService',
    methodLocalName: 'trade',
    methodName: 'Trade',
    modelLabel: 'STREAM_STREAM',
    isBidirectional: true,
    inputTypeName: 'demo.v1.Order',
    outputTypeName: 'demo.v1.Ack',
    requestJson: '{"symbol":"AAPL"}',
    requestTemplate: '{}',
  }

  return openingModel({ channelId, config })
}

/**
 * A transport that counts the calls started and stopped on it and lets a test speak for the
 * server through `report`. Starting or stopping throws when told to.
 */
const makeTransport = (
  behaviour: Readonly<{ startThrows?: boolean; stopThrows?: boolean; isConnected?: boolean }> = {}
) => {
  const log = { started: 0, stopped: 0 }
  const listeners: Array<(event: CallEvent) => void> = []
  const transport: CallTransport<string, never> = {
    client:
      behaviour.isConnected === false
        ? Effect.fail(unknownFailure('no connection'))
        : Effect.succeed('client'),
    start: (_client, _service, method, _request, onEvent) => {
      if (behaviour.startThrows === true) {
        throw new Error('channel refused')
      }
      log.started += 1
      listeners.push(onEvent)

      return {
        method,
        maybeSend: Option.none(),
        stop: () => {
          log.stopped += 1
          if (behaviour.stopThrows === true) {
            throw new Error('unsubscribe failed')
          }
        },
      }
    },
  }

  return {
    transport,
    log,
    report: (event: CallEvent) => {
      listeners.forEach((listener) => {
        listener(event)
      })
    },
  }
}

/** Longer than one window of events, so what was reported has been emitted. */
const settle = Effect.sleep('250 millis')

describe('connect', () => {
  test('files the call while the scope is open, and stops and removes it when the scope closes', async () => {
    const { transport, log } = makeTransport()
    const messages: Array<Message> = []

    const result = await run(
      Effect.gen(function* () {
        const handles = yield* RpcHandles
        const registryId = yield* loadRegistry
        const scope = yield* Scope.make()

        yield* Scope.provide(
          makeConnect(transport)(channel('1', registryId), (message) => {
            messages.push(message)
          }),
          scope
        )
        const whileConnected = yield* handles.get('1')
        const stoppedWhileConnected = log.stopped
        yield* Scope.close(scope, Exit.void)

        return {
          isFiledWhileConnected: Option.isSome(whileConnected),
          stoppedWhileConnected,
          afterClose: yield* handles.get('1'),
        }
      })
    )

    expect(result.isFiledWhileConnected).toBe(true)
    expect(result.stoppedWhileConnected).toBe(0)
    expect(result.afterClose).toEqual(Option.none())
    expect(log).toEqual({ started: 1, stopped: 1 })
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ _tag: 'SucceededOpenCall' })
    expect(
      messages[0]?._tag === 'SucceededOpenCall' ? JSON.parse(messages[0].sent.json) : undefined
    ).toEqual({ symbol: 'AAPL' })
  })

  test('a stop that throws still removes the call, and closing the scope succeeds', async () => {
    const { transport, log } = makeTransport({ stopThrows: true })

    const result = await run(
      Effect.gen(function* () {
        const handles = yield* RpcHandles
        const registryId = yield* loadRegistry
        const scope = yield* Scope.make()

        yield* Scope.provide(
          makeConnect(transport)(channel('1', registryId), () => undefined),
          scope
        )
        const closed = yield* Effect.exit(Scope.close(scope, Exit.void))

        return { isClosed: Exit.isSuccess(closed), afterClose: yield* handles.get('1') }
      })
    )

    expect(result.isClosed).toBe(true)
    expect(result.afterClose).toEqual(Option.none())
    expect(log.stopped).toBe(1)
  })

  test('a registry that is not retained is reported as a failed open, and no call is started', async () => {
    const { transport, log } = makeTransport()
    const messages: Array<Message> = []

    const filed = await run(
      Effect.gen(function* () {
        const handles = yield* RpcHandles
        yield* loadRegistry

        yield* Effect.scoped(
          makeConnect(transport)(channel('1', 42), (message) => {
            messages.push(message)
          })
        )

        return yield* handles.get('1')
      })
    )

    expect(messages).toMatchObject([
      { _tag: 'FailedOpenCall', error: { type: 'UNKNOWN', message: REGISTRY_NOT_RETAINED } },
    ])
    expect(log.started).toBe(0)
    expect(filed).toEqual(Option.none())
  })

  test('a call that cannot be started is reported as a failed open, and nothing is filed', async () => {
    const refusing = makeTransport({ startThrows: true })
    const disconnected = makeTransport({ isConnected: false })
    const messages: Array<Message> = []

    const filed = await run(
      Effect.gen(function* () {
        const handles = yield* RpcHandles
        const registryId = yield* loadRegistry
        const scope = yield* Scope.make()
        const emit = (message: Message) => {
          messages.push(message)
        }

        yield* Scope.provide(makeConnect(refusing.transport)(channel('1', registryId), emit), scope)
        yield* Scope.provide(
          makeConnect(disconnected.transport)(channel('2', registryId), emit),
          scope
        )
        const whileConnected = [yield* handles.get('1'), yield* handles.get('2')]
        yield* Scope.close(scope, Exit.void)

        return whileConnected
      })
    )

    expect(messages).toMatchObject([
      { _tag: 'FailedOpenCall', error: { type: 'UNKNOWN', message: 'channel refused' } },
      { _tag: 'FailedOpenCall', error: { type: 'UNKNOWN', message: 'no connection' } },
    ])
    expect(filed).toEqual([Option.none(), Option.none()])
    expect(disconnected.log.started).toBe(0)
  })

  test('what the call reports is emitted in windows, and nothing is emitted once the scope closed', async () => {
    const { transport, report } = makeTransport()
    const messages: Array<Message> = []

    await run(
      Effect.gen(function* () {
        const registryId = yield* loadRegistry
        const scope = yield* Scope.make()

        yield* Scope.provide(
          makeConnect(transport)(channel('1', registryId), (message) => {
            messages.push(message)
          }),
          scope
        )
        report({ _tag: 'Response', json: 'a' })
        report({ _tag: 'Response', json: 'b' })
        report({ _tag: 'Failed', type: 'TIMEOUT', message: 'late' })
        yield* settle
        yield* Scope.close(scope, Exit.void)
        report({ _tag: 'Response', json: 'c' })
        yield* settle
      })
    )

    expect(messages).toMatchObject([
      { _tag: 'SucceededOpenCall' },
      { _tag: 'ReceivedResponses', responses: [{ json: 'a' }, { json: 'b' }] },
      { _tag: 'FailedCall', error: { type: 'TIMEOUT', message: 'late' } },
    ])
    expect(messages).toHaveLength(3)
  })
})

describe('toMessages', () => {
  test('one window of events becomes ordered Messages, consecutive responses merged', () => {
    expect(
      toMessages(
        [
          { _tag: 'Response', json: 'a' },
          { _tag: 'Response', json: 'b' },
          { _tag: 'Failed', type: 'TIMEOUT', message: 'late' },
          { _tag: 'Response', json: 'c' },
          { _tag: 'Ended' },
        ],
        '10:02'
      )
    ).toEqual([
      Message.ReceivedResponses({
        responses: [
          { time: '10:02', json: 'a' },
          { time: '10:02', json: 'b' },
        ],
      }),
      Message.FailedCall({ error: { type: 'TIMEOUT', message: 'late', time: '10:02' } }),
      Message.ReceivedResponses({ responses: [{ time: '10:02', json: 'c' }] }),
      Message.EndedCall(),
    ])
  })
})
