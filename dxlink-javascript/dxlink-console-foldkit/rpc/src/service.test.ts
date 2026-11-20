import { Array, Effect, Option } from 'effect'
import { describe, expect, test } from 'vitest'

import { Descriptors } from './domain'
import { binaryDescriptorSet } from './domain/descriptors.fixture'
import {
  MAX_RETAINED_REGISTRIES,
  type MethodAddress,
  REGISTRY_NOT_RETAINED,
  RpcRegistry,
  resolveMethod,
} from './service'
import { loadRegistry, run } from './testing.fixture'

const issue = { serviceName: 'demo.v1.OrderService', methodLocalName: 'issue' }

/** Why a method could not be resolved, or `resolved` when it could. */
const resolutionOf = (address: MethodAddress) =>
  Effect.match(resolveMethod(address), {
    onFailure: (error) => error.message,
    onSuccess: () => 'resolved',
  })

describe('the registry store', () => {
  test('each registry gets its own identity and is resolved by it', async () => {
    const result = await run(
      Effect.gen(function* () {
        const store = yield* RpcRegistry
        const first = Descriptors.parseDescriptorSet(binaryDescriptorSet())
        const second = Descriptors.parseDescriptorSet(binaryDescriptorSet())
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
