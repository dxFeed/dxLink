import type {
  DescMethod,
  JsonReadOptions,
  JsonWriteOptions,
  Message,
  MessageInitShape,
  MessageShape,
} from '@bufbuild/protobuf'
import type { DXLinkLogLevel } from '@dxfeed/dxlink-core'
import type { DxLinkRpcCallOptions } from '@dxfeed/dxlink-rpc'
import type { Observable } from 'rxjs'

// Re-exported so consumers can name generated service descriptors without importing
// `@bufbuild/protobuf/codegenv2` directly.
export type { GenService, GenServiceMethods } from '@bufbuild/protobuf/codegenv2'
export type { DescMethod, DescService } from '@bufbuild/protobuf'
export type { DxLinkRpcCallOptions } from '@dxfeed/dxlink-rpc'

/**
 * Options for {@link createDXLinkService}.
 */
export interface DXLinkServiceOptions {
  /**
   * Log level for the underlying `DxLinkRpcService`.
   * @default DXLinkLogLevel.WARN
   */
  logLevel?: DXLinkLogLevel
  /**
   * Options passed to `toJson` when encoding requests.
   *
   * The defaults produce canonical protobuf-JSON, which is what the server's `dxlink-ws-json`
   * subprotocol expects; override only to match a server that deviates from it.
   */
  jsonWriteOptions?: Partial<JsonWriteOptions>
  /**
   * Options passed to `fromJson` when decoding responses.
   *
   * Supply a `registry` here when response messages embed `google.protobuf.Any`.
   */
  jsonReadOptions?: Partial<JsonReadOptions>
}

/**
 * The subset of {@link DescMethod} that determines the shape of a generated client method.
 */
type MethodShape = Pick<DescMethod, 'input' | 'output' | 'methodKind'>

/**
 * Maps a single protobuf-es method descriptor to its client function.
 *
 * Unary and server-streaming methods take one request; bidirectional methods take an
 * `Observable` of requests. All of them return an `Observable` of responses — a unary call
 * emits once and completes. Client-streaming methods map to `never`: the dxLink v1.0 wire
 * cannot carry them, so calling one is a compile error and binding one throws
 * {@link DXLinkUnsupportedMethodKindError}.
 */
export type DXLinkServiceMethod<M extends MethodShape> = M extends {
  methodKind: 'unary' | 'server_streaming'
}
  ? (
      request: MessageInitShape<M['input']>,
      options?: DxLinkRpcCallOptions
    ) => Observable<MessageShape<M['output']>>
  : M extends { methodKind: 'bidi_streaming' }
    ? (requests: Observable<MessageInitShape<M['input']>>) => Observable<MessageShape<M['output']>>
    : never

/**
 * A fully-typed client for a generated service: one method per RPC, with request and response
 * types inferred from the descriptor.
 * @see {@link createDXLinkService}
 */
export type DXLinkServiceClient<S extends Record<string, MethodShape>> = {
  [K in keyof S]: DXLinkServiceMethod<S[K]>
}

/**
 * A single method of a {@link DXLinkDynamicServiceClient}.
 *
 * Descriptors loaded at runtime carry no static types, so requests are plain objects and
 * responses are untyped `Message`s. Which of the two request forms a method accepts depends on
 * its interaction model — pass an `Observable` to a bidirectional method, a single object to
 * any other.
 */
export type DXLinkDynamicServiceMethod = (
  request: Record<string, unknown> | Observable<Record<string, unknown>>,
  options?: DxLinkRpcCallOptions
) => Observable<Message>

/**
 * A client built from a service descriptor resolved at runtime (for example from a
 * `FileDescriptorSet` fetched from the server), where method names are not known statically.
 * @see {@link createDXLinkService}
 */
export type DXLinkDynamicServiceClient = Record<string, DXLinkDynamicServiceMethod>
