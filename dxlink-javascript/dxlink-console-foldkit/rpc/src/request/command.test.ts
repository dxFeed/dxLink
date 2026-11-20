import { Effect, Option } from 'effect'
import { describe, expect, test } from 'vitest'

import { REGISTRY_NOT_RETAINED } from '../service'
import { loadRegistry, run } from '../testing.fixture'
import { ValidateRequest } from './command'

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
