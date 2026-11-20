import { Array, Effect, Option } from 'effect'
import { describe, expect, test } from 'vitest'

import { CloseCall, SendRequest, ValidateSendRequest } from './channel'
import { parseDescriptorSet } from './descriptors'
import { binaryDescriptorSet } from './descriptors.fixture'
import { ValidateRequest } from './request'
import {
  type CallHandle,
  MAX_RETAINED_REGISTRIES,
  type MethodAddress,
  REGISTRY_NOT_RETAINED,
  RpcHandles,
  RpcRegistry,
  resolveMethod,
  rpcLayer,
} from './service'

const run = <A>(effect: Effect.Effect<A, never, RpcRegistry | RpcHandles>): Promise<A> =>
  Effect.runPromise(Effect.provide(effect, rpcLayer))

const loadRegistry = Effect.gen(function* () {
  const store = yield* RpcRegistry

  return yield* store.add(parseDescriptorSet(binaryDescriptorSet()))
})

const issue = { serviceName: 'demo.v1.OrderService', methodLocalName: 'issue' }

/** Why a method could not be resolved, or `resolved` when it could. */
const resolutionOf = (address: MethodAddress) =>
  Effect.match(resolveMethod(address), {
    onFailure: (error) => error.message,
    onSuccess: () => 'resolved',
  })

/** A live call that records what is asked of it; `stop` and `send` throw when told to. */
const makeHandle = (
  registryId: number,
  behaviour: Readonly<{ stopThrows?: boolean; sendThrows?: boolean }> = {}
) =>
  Effect.gen(function* () {
    const { method } = yield* Effect.orDie(
      resolveMethod({ registryId, serviceName: 'demo.v1.OrderService', methodLocalName: 'trade' })
    )
    const calls = { stopped: 0, sent: 0 }
    const handle: CallHandle = {
      method,
      maybeSend: Option.some(() => {
        if (behaviour.sendThrows === true) {
          throw new Error('send refused')
        }
        calls.sent += 1
      }),
      stop: () => {
        calls.stopped += 1
        if (behaviour.stopThrows === true) {
          throw new Error('unsubscribe failed')
        }
      },
    }

    return { handle, calls }
  })

describe('the registry store', () => {
  test('each registry gets its own identity and is resolved by it', async () => {
    const result = await run(
      Effect.gen(function* () {
        const store = yield* RpcRegistry
        const first = parseDescriptorSet(binaryDescriptorSet())
        const second = parseDescriptorSet(binaryDescriptorSet())
        const firstId = yield* store.add(first)
        const secondId = yield* store.add(second)

        return {
          firstId,
          secondId,
          isFirst: Option.getOrUndefined(yield* store.get(firstId)) === first,
          isSecond: Option.getOrUndefined(yield* store.get(secondId)) === second,
          unknown: yield* store.get(99),
        }
      })
    )

    expect(result.firstId).not.toBe(result.secondId)
    expect(result.isFirst).toBe(true)
    expect(result.isSecond).toBe(true)
    expect(result.unknown).toEqual(Option.none())
  })

  test('only the most recent registries are retained, and a dropped one is reported as gone', async () => {
    const result = await run(
      Effect.gen(function* () {
        const firstId = yield* loadRegistry
        const laterIds = yield* Effect.all(
          Array.makeBy(MAX_RETAINED_REGISTRIES, () => loadRegistry)
        )
        const store = yield* RpcRegistry

        return {
          first: yield* store.get(firstId),
          retained: yield* Effect.all(Array.map(laterIds, (registryId) => store.get(registryId))),
          resolution: yield* resolutionOf({ registryId: firstId, ...issue }),
        }
      })
    )

    expect(result.first).toEqual(Option.none())
    expect(Array.every(result.retained, Option.isSome)).toBe(true)
    expect(result.resolution).toBe(REGISTRY_NOT_RETAINED)
  })

  test('a method the registry does not declare is named in the failure', async () => {
    const error = await run(
      Effect.gen(function* () {
        const registryId = yield* loadRegistry

        return yield* resolutionOf({
          registryId,
          serviceName: 'demo.v1.OrderService',
          methodLocalName: 'cancel',
        })
      })
    )

    expect(error).toBe('The loaded definitions do not declare demo.v1.OrderService/cancel')
  })
})

describe('ValidateRequest', () => {
  test('gives a verdict against the registry the request names', async () => {
    const messages = await run(
      Effect.gen(function* () {
        const registryId = yield* loadRegistry
        const checked = { registryId, serviceName: 'demo.v1.OrderService', methodName: 'issue' }

        return [
          yield* ValidateRequest({ ...checked, json: '{"symbol":"AAPL"}' }).effect,
          yield* ValidateRequest({ ...checked, json: '{"smybol":"AAPL"}' }).effect,
        ]
      })
    )

    expect(messages[0]).toMatchObject({
      _tag: 'SucceededValidateRequest',
      json: '{"symbol":"AAPL"}',
      maybeError: Option.none(),
    })
    expect(messages[1]).toMatchObject({ _tag: 'SucceededValidateRequest' })
    expect(messages[1]).toHaveProperty('maybeError._tag', 'Some')
  })

  test('fails when the registry the request names is not retained', async () => {
    const message = await run(
      Effect.gen(function* () {
        yield* loadRegistry

        return yield* ValidateRequest({
          registryId: 42,
          serviceName: 'demo.v1.OrderService',
          methodName: 'issue',
          json: '{}',
        }).effect
      })
    )

    expect(message).toEqual({
      _tag: 'FailedValidateRequest',
      registryId: 42,
      serviceName: 'demo.v1.OrderService',
      methodName: 'issue',
      json: '{}',
      reason: REGISTRY_NOT_RETAINED,
    })
  })
})

describe('Commands on a live call', () => {
  test('CloseCall stops the call and removes it from the handles', async () => {
    const result = await run(
      Effect.gen(function* () {
        const handles = yield* RpcHandles
        const { handle, calls } = yield* makeHandle(yield* loadRegistry)
        yield* handles.put('1', handle)

        return {
          first: yield* CloseCall({ channelId: '1' }).effect,
          second: yield* CloseCall({ channelId: '1' }).effect,
          calls,
        }
      })
    )

    expect(result.first).toEqual({ _tag: 'SucceededCloseCall' })
    expect(result.second).toEqual({ _tag: 'SucceededCloseCall' })
    expect(result.calls.stopped).toBe(1)
  })

  test('CloseCall reports a stop that throws, and the call is still taken out', async () => {
    const result = await run(
      Effect.gen(function* () {
        const handles = yield* RpcHandles
        const { handle } = yield* makeHandle(yield* loadRegistry, { stopThrows: true })
        yield* handles.put('1', handle)

        return {
          message: yield* CloseCall({ channelId: '1' }).effect,
          remaining: yield* handles.get('1'),
        }
      })
    )

    expect(result.message).toMatchObject({
      _tag: 'FailedCloseCall',
      error: { type: 'UNKNOWN', message: 'unsubscribe failed' },
    })
    expect(result.remaining).toEqual(Option.none())
  })

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
