import { Effect, Option } from 'effect'
import { describe, expect, test } from 'vitest'

import { type CallHandle, RpcHandles, resolveMethod } from '../service'
import { loadRegistry, run } from '../testing.fixture'
import { SendRequest, ValidateSendRequest } from './command'

/** A live bidirectional call that counts what is sent on it; `send` throws when told to. */
const makeHandle = (registryId: number, behaviour: Readonly<{ sendThrows?: boolean }> = {}) =>
  Effect.gen(function* () {
    const { method } = yield* Effect.orDie(
      resolveMethod({ registryId, serviceName: 'demo.v1.OrderService', methodLocalName: 'trade' })
    )
    const calls = { sent: 0 }
    const handle: CallHandle = {
      method,
      maybeSend: Option.some(() => {
        if (behaviour.sendThrows === true) {
          throw new Error('send refused')
        }
        calls.sent += 1
      }),
      stop: () => undefined,
    }

    return { handle, calls }
  })

describe('Commands on a live call', () => {
  test('ValidateSendRequest fails when no call is filed under the channel', async () => {
    const message = await run(ValidateSendRequest({ channelId: '1', json: '{}' }).effect)

    expect(message).toMatchObject({
      _tag: 'FailedValidateSendRequest',
      json: '{}',
      error: { type: 'UNKNOWN', message: 'The call is no longer open.' },
    })
  })

  test('ValidateSendRequest gives a verdict against the method of the live call', async () => {
    const messages = await run(
      Effect.gen(function* () {
        const handles = yield* RpcHandles
        const { handle } = yield* makeHandle(yield* loadRegistry)
        yield* handles.put('1', handle)

        return [
          yield* ValidateSendRequest({ channelId: '1', json: '{"symbol":"AAPL"}' }).effect,
          yield* ValidateSendRequest({ channelId: '1', json: '{"smybol":""}' }).effect,
        ]
      })
    )

    expect(messages[0]).toEqual({
      _tag: 'SucceededValidateSendRequest',
      json: '{"symbol":"AAPL"}',
      maybeError: Option.none(),
    })
    expect(messages[1]).toHaveProperty('maybeError._tag', 'Some')
  })

  test('SendRequest sends on the live call, and reports a send that throws', async () => {
    const result = await run(
      Effect.gen(function* () {
        const handles = yield* RpcHandles
        const registryId = yield* loadRegistry
        const working = yield* makeHandle(registryId)
        const refusing = yield* makeHandle(registryId, { sendThrows: true })
        yield* handles.put('1', working.handle)
        yield* handles.put('2', refusing.handle)

        return {
          sent: yield* SendRequest({ channelId: '1', json: '{"symbol":"AAPL"}' }).effect,
          refused: yield* SendRequest({ channelId: '2', json: '{"symbol":"AAPL"}' }).effect,
          missing: yield* SendRequest({ channelId: '3', json: '{}' }).effect,
          sentCount: working.calls.sent,
        }
      })
    )

    expect(result.sent).toMatchObject({ _tag: 'SucceededSendRequest' })
    expect(result.sentCount).toBe(1)
    expect(result.refused).toMatchObject({
      _tag: 'FailedSendRequest',
      error: { type: 'UNKNOWN', message: 'send refused' },
    })
    expect(result.missing).toMatchObject({
      _tag: 'FailedSendRequest',
      error: { type: 'UNKNOWN', message: 'The call is no longer open.' },
    })
  })
})
