import { Context, Effect, Layer, MutableRef, Option } from 'effect'

import type { DescMethod, FileRegistry, Message } from '@bufbuild/protobuf'
import {
  type ChannelHandles,
  type DxLinkClientService,
  makeChannelHandles,
} from '@dxfeed/dxlink-console-foldkit-core'

/**
 * The registry built from the descriptor set that was loaded last.
 *
 * A registry is a graph of live descriptor objects, so it is kept here rather than in a
 * Model. The request form holds a plain summary of it and asks Commands to validate against
 * the real thing; a call resolves its service and method from it once, when it opens.
 */
export type RegistryStore = Readonly<{
  set: (registry: FileRegistry) => Effect.Effect<void>
  get: Effect.Effect<Option.Option<FileRegistry>>
}>

export class RpcRegistry extends Context.Service<RpcRegistry, RegistryStore>()(
  '@dxfeed/dxlink-console-foldkit-rpc/RpcRegistry'
) {}

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
  Layer.sync(RpcRegistry, () => {
    const ref = MutableRef.make(Option.none<FileRegistry>())

    return {
      set: (registry) =>
        Effect.sync(() => {
          MutableRef.set(ref, Option.some(registry))
        }),
      get: Effect.sync(() => MutableRef.get(ref)),
    }
  }),
  Layer.effect(RpcHandles, makeChannelHandles<CallHandle, CallEvent>())
)
