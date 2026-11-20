import { Array, Context, Data, Effect, Layer, MutableRef, Option, pipe } from 'effect'

import type { DescMethod, DescService, FileRegistry, Message } from '@bufbuild/protobuf'
import {
  type ChannelHandles,
  type DxLinkClientService,
  makeChannelHandles,
} from '@dxfeed/dxlink-console-foldkit-core'

/**
 * How many registries the store keeps addressable. The request form refers to the one it
 * loaded last, and a call resolves its descriptors once, as it opens, so only the most
 * recent few can still be asked for.
 */
export const MAX_RETAINED_REGISTRIES = 4

/**
 * The registries built from the descriptor sets loaded so far, each under its own identity.
 *
 * A registry is a graph of live descriptor objects, so it is kept here rather than in a
 * Model. A Model holds a plain summary of one registry together with that registry's
 * identity, and every Command that needs the real thing asks for it by that identity. A
 * summary and the registry it is resolved against therefore always describe the same
 * descriptor set, or the registry is reported as gone.
 */
export type RegistryStore = Readonly<{
  /**
   * Retain a registry and return the identity it is addressable by. An identity is issued
   * once and never reused; the oldest registries beyond {@link MAX_RETAINED_REGISTRIES} are
   * dropped.
   */
  add: (registry: FileRegistry) => Effect.Effect<number>
  /** `None` for an identity that was never issued or whose registry is not retained. */
  get: (registryId: number) => Effect.Effect<Option.Option<FileRegistry>>
}>

export class RpcRegistry extends Context.Service<RpcRegistry, RegistryStore>()(
  '@dxfeed/dxlink-console-foldkit-rpc/RpcRegistry'
) {}

type RetainedRegistry = Readonly<{ registryId: number; registry: FileRegistry }>

type Retained = Readonly<{
  nextRegistryId: number
  /** Newest first. */
  registries: ReadonlyArray<RetainedRegistry>
}>

export const makeRegistryStore = (): RegistryStore => {
  const ref = MutableRef.make<Retained>({ nextRegistryId: 1, registries: [] })

  return {
    add: (registry) =>
      Effect.sync(() => {
        const { nextRegistryId, registries } = MutableRef.get(ref)
        MutableRef.set(ref, {
          nextRegistryId: nextRegistryId + 1,
          registries: pipe(
            registries,
            Array.prepend({ registryId: nextRegistryId, registry }),
            Array.take(MAX_RETAINED_REGISTRIES)
          ),
        })

        return nextRegistryId
      }),
    get: (registryId) =>
      Effect.sync(() =>
        pipe(
          MutableRef.get(ref).registries,
          Array.findFirst((retained) => retained.registryId === registryId),
          Option.map((retained) => retained.registry)
        )
      ),
  }
}

/** A method that cannot be resolved; `message` says why, in words for the user. */
export class MethodNotAvailable extends Data.TaggedError('MethodNotAvailable')<{
  message: string
}> {}

/** A method as a Model names it: the registry it was summarized from, and where it is there. */
export type MethodAddress = Readonly<{
  registryId: number
  serviceName: string
  /** ECMAScript name of the method, as `DescService.method` keys it. */
  methodLocalName: string
}>

export const REGISTRY_NOT_RETAINED =
  'The service definitions this request was written against are no longer loaded. Load them again.'

/**
 * The live descriptors of a method, from the registry its address names. Fails when that
 * registry is not retained, rather than answering from whichever registry was loaded last.
 */
export const resolveMethod = ({
  registryId,
  serviceName,
  methodLocalName,
}: MethodAddress): Effect.Effect<
  Readonly<{ service: DescService; method: DescMethod }>,
  MethodNotAvailable,
  RpcRegistry
> =>
  Effect.gen(function* () {
    const store = yield* RpcRegistry
    const maybeRegistry = yield* store.get(registryId)
    if (Option.isNone(maybeRegistry)) {
      return yield* new MethodNotAvailable({ message: REGISTRY_NOT_RETAINED })
    }
    const service = maybeRegistry.value.getService(serviceName)
    const method = service?.method[methodLocalName]
    if (service === undefined || method === undefined) {
      return yield* new MethodNotAvailable({
        message: `The loaded definitions do not declare ${serviceName}/${methodLocalName}`,
      })
    }

    return { service, method }
  })

/** What a live call reports on its own, before it is stamped with a time. */
export type CallEvent =
  | Readonly<{ _tag: 'Response'; json: string }>
  | Readonly<{ _tag: 'Ended' }>
  | Readonly<{ _tag: 'Failed'; type: string; message: string }>

/** One live call. */
export type CallHandle = Readonly<{
  /** The method being called; later requests of a bidirectional call are parsed against it. */
  method: DescMethod
  /** Send another request. `None` unless the method is bidirectional. */
  maybeSend: Option.Option<(message: Message) => void>
  /** Cancel the call, which releases its channel. */
  stop: () => void
}>

export class RpcHandles extends Context.Service<
  RpcHandles,
  ChannelHandles<CallHandle, CallEvent>
>()('@dxfeed/dxlink-console-foldkit-rpc/RpcHandles') {}

/** Everything the RPC plugin's Commands and event Stream require. */
export type RpcServices = RpcRegistry | RpcHandles | DxLinkClientService

/**
 * The plugin's app-lifetime services, for the runtime's `resources`. The dxLink client is
 * not among them: the console provides that for as long as a session is open.
 */
export const rpcLayer: Layer.Layer<RpcRegistry | RpcHandles> = Layer.mergeAll(
  Layer.sync(RpcRegistry, makeRegistryStore),
  Layer.effect(RpcHandles, makeChannelHandles<CallHandle, CallEvent>())
)
