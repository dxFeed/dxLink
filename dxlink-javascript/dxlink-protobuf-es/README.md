# dxLink protobuf-es binding

Binds [protobuf-es](https://github.com/bufbuild/protobuf-es) service descriptors to the dxLink RPC
transport, so a generated `.proto` service becomes a typed client without any dxLink-specific
codegen.

Protobuf is the source of truth for the service definitions; this package is the small runtime
piece that turns their descriptors into calls over
[`@dxfeed/dxlink-rpc`](../dxlink-rpc). Requests and responses travel as canonical protobuf-JSON,
the encoding the server's `dxlink-ws-json` subprotocol expects.

## Install

```sh
npm install @dxfeed/dxlink-protobuf-es @dxfeed/dxlink-websocket-client @bufbuild/protobuf rxjs
```

`@bufbuild/protobuf` and `rxjs` are peer dependencies. Keep a single copy of `@bufbuild/protobuf`
in the dependency tree — two copies mean two descriptor sets for one type name, which breaks
registry lookups.

## Generated descriptors

```ts
import { createDXLinkService } from '@dxfeed/dxlink-protobuf-es'
import { DXLinkWebSocketClient } from '@dxfeed/dxlink-websocket-client'
import { EntryService } from './gen/orders/v1/entry_pb'

const client = new DXLinkWebSocketClient()
client.setAuthToken(token)
client.connect('wss://demo.dxfeed.com/dxlink-ws')

const orders = createDXLinkService(client, EntryService)

orders.issueOrder({ accountId: '1', quantity: 10 }).subscribe({
  next: (response) => console.log(response),
  error: (error) => console.error(error),
})
```

Request and response types are inferred from the descriptor. Each call opens its own channel,
named by the service's fully qualified type name and the method's protobuf name, and closes it
when the subscription ends.

## Runtime descriptors

Descriptors resolved in the browser — from a `FileDescriptorSet` served by the backend, say — work
the same way, minus the static types:

```ts
import { createFileRegistry, fromBinary } from '@bufbuild/protobuf'
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt'
import { createDXLinkDynamicService } from '@dxfeed/dxlink-protobuf-es'

const response = await fetch(descriptorsUrl)
const set = fromBinary(FileDescriptorSetSchema, new Uint8Array(await response.arrayBuffer()))
const registry = createFileRegistry(set)

const service = registry.getService('example.orders.v1.EntryService')!
const orders = createDXLinkDynamicService(client, service)

orders['issueOrder']?.({ accountId: '1' }).subscribe(console.log)
```

## Interaction models

| protobuf-es method kind | dxLink model       | Client surface                                |
| ----------------------- | ------------------ | --------------------------------------------- |
| `unary`                 | `REQUEST_RESPONSE` | `(request, options?) => Observable<Response>` |
| `server_streaming`      | `REQUEST_STREAM`   | `(request, options?) => Observable<Response>` |
| `bidi_streaming`        | `STREAM_STREAM`    | `(requests$) => Observable<Response>`         |
| `client_streaming`      | —                  | not supported                                 |

A unary call emits one response and completes when the server closes the channel. Pass
`{ retry: true }` to re-open the channel and re-send the request after a connection drop.

Client-streaming methods are rejected with `DXLinkUnsupportedMethodKindError` when the service is
bound: the dxLink v1.0 wire has no graceful request half-close, so the server is never told that
the requests ended and cannot know when to answer. Bidirectional streaming does not need that
signal — it is a long-lived duplex subscription.

Pass `{ skipUnsupportedMethods: true }` to leave those methods out of the client instead of
throwing. That suits a descriptor picked at runtime, where one unsupported method should not make
the rest of the service unreachable.
