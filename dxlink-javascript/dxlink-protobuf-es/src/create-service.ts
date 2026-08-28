import type { DescService, JsonValue } from '@bufbuild/protobuf'
import type { GenService, GenServiceMethods } from '@bufbuild/protobuf/codegenv2'
import type { DXLinkClient } from '@dxfeed/dxlink-core'
import { DxLinkRpcService } from '@dxfeed/dxlink-rpc'
import { isObservable, map, type Observable } from 'rxjs'

import { decodeResponse, encodeRequest } from './codec'
import { DXLinkUnsupportedMethodKindError } from './errors'
import type {
  DXLinkDynamicServiceClient,
  DXLinkDynamicServiceMethod,
  DXLinkServiceClient,
  DXLinkServiceOptions,
} from './service'

const bindService = (
  client: DXLinkClient,
  service: DescService,
  options: DXLinkServiceOptions
): DXLinkDynamicServiceClient => {
  const { logLevel, jsonReadOptions, jsonWriteOptions } = options

  // `DxLinkRpcService` fills in its own default log level, so pass the key only when it was set.
  const rpc = new DxLinkRpcService(
    client,
    service.typeName,
    logLevel === undefined ? {} : { logLevel }
  )

  const api: DXLinkDynamicServiceClient = {}

  // Unary, server-streaming and bidirectional methods are carried; client-streaming is not.
  //
  // The dxLink v1.0 wire has no graceful request half-close, and that gap is fatal for
  // client-streaming only: its contract is "N requests, then one response", so the server cannot
  // know when to answer without being told the requests ended. Bidirectional streaming does not
  // depend on that signal — it is a duplex subscription, where the server streams responses as
  // requests arrive and never waits for the input to complete. Unsupported methods are rejected
  // here, while the descriptor is being bound, rather than at call time.
  for (const [localName, method] of Object.entries(service.method)) {
    const encode = (request: unknown) => encodeRequest(service, method, request, jsonWriteOptions)
    const decode = (payload: unknown) => decodeResponse(service, method, payload, jsonReadOptions)

    switch (method.methodKind) {
      case 'unary': {
        api[localName] = ((request, callOptions) =>
          rpc
            .requestResponse<JsonValue, unknown>(method.name, encode(request), callOptions)
            .pipe(map(decode))) satisfies DXLinkDynamicServiceMethod
        break
      }
      case 'server_streaming': {
        api[localName] = ((request, callOptions) =>
          rpc
            .requestStream<JsonValue, unknown>(method.name, encode(request), callOptions)
            .pipe(map(decode))) satisfies DXLinkDynamicServiceMethod
        break
      }
      case 'bidi_streaming': {
        api[localName] = ((requests) => {
          if (!isObservable(requests)) {
            throw new TypeError(
              `${service.typeName}/${method.name} is bidirectional and expects an Observable of requests`
            )
          }
          const input$ = (requests as Observable<Record<string, unknown>>).pipe(map(encode))
          return rpc.streamStream<JsonValue, unknown>(method.name, input$).pipe(map(decode))
        }) satisfies DXLinkDynamicServiceMethod
        break
      }
      default:
        throw new DXLinkUnsupportedMethodKindError(service.typeName, method.name, method.methodKind)
    }
  }

  return api
}

/**
 * Bind a generated protobuf-es service descriptor to a dxLink client, producing a fully-typed
 * client stub with one method per RPC.
 *
 * The descriptor is data by the time it gets here — protobuf-es already did the code generation —
 * so the stub is assembled at runtime, method by method, over the RPC transport of
 * `@dxfeed/dxlink-rpc`. Each call opens its own channel on the given client, named by the
 * service's fully qualified type name and the method's protobuf name. Requests and responses
 * travel as canonical protobuf-JSON.
 *
 * Unary and server-streaming methods take a single request; bidirectional methods take an
 * `Observable` of requests. All of them return an `Observable` of responses.
 *
 * ```ts
 * const client = new DXLinkWebSocketClient()
 * client.connect('wss://demo.dxfeed.com/dxlink-ws')
 *
 * const orders = createDXLinkService(client, EntryService)
 * orders.issueOrder({ accountId: '1', quantity: 10 }).subscribe(console.log)
 * ```
 *
 * @param client - dxLink client that owns the channels.
 * @param service - Generated `GenService` descriptor, as emitted by `protoc-gen-es`.
 * @param options - Log level and protobuf-JSON options.
 * @throws {DXLinkUnsupportedMethodKindError} If the service declares a client-streaming method.
 * @see {@link createDXLinkDynamicService} for descriptors resolved at runtime.
 */
export const createDXLinkService = <S extends GenServiceMethods>(
  client: DXLinkClient,
  service: GenService<S>,
  options: DXLinkServiceOptions = {}
): DXLinkServiceClient<S> =>
  bindService(client, service as DescService, options) as unknown as DXLinkServiceClient<S>

/**
 * Bind a service descriptor resolved at runtime — from a `FileDescriptorSet` fetched from the
 * server, for example — to a dxLink client.
 *
 * Identical to {@link createDXLinkService} at runtime; only the typing differs. Method names are
 * not known statically, so the stub is a record of loosely-typed methods: requests are plain
 * objects (an `Observable` of them for bidirectional methods) and responses are untyped
 * `Message`s.
 *
 * ```ts
 * const set = fromBinary(FileDescriptorSetSchema, new Uint8Array(await res.arrayBuffer()))
 * const registry = createFileRegistry(set)
 *
 * const service = registry.getService('example.orders.v1.EntryService')
 * const orders = createDXLinkDynamicService(client, service!)
 * orders['issueOrder']?.({ accountId: '1' }).subscribe(console.log)
 * ```
 *
 * @param client - dxLink client that owns the channels.
 * @param service - Service descriptor resolved from a registry.
 * @param options - Log level and protobuf-JSON options.
 * @throws {DXLinkUnsupportedMethodKindError} If the service declares a client-streaming method.
 */
export const createDXLinkDynamicService = (
  client: DXLinkClient,
  service: DescService,
  options: DXLinkServiceOptions = {}
): DXLinkDynamicServiceClient => bindService(client, service, options)
