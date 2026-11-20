import { Effect } from 'effect'

import { Descriptors } from './domain'
import { binaryDescriptorSet } from './domain/descriptors.fixture'
import { type RpcHandles, RpcRegistry, rpcLayer } from './service'

/** Run an Effect against the plugin's own services, built fresh for the run. */
export const run = <A>(effect: Effect.Effect<A, never, RpcRegistry | RpcHandles>): Promise<A> =>
  Effect.runPromise(Effect.provide(effect, rpcLayer))

/** Retain the registry of the test descriptor set and return its identity. */
export const loadRegistry = Effect.gen(function* () {
  const store = yield* RpcRegistry

  return yield* store.add(Descriptors.parseDescriptorSet(binaryDescriptorSet()))
})
