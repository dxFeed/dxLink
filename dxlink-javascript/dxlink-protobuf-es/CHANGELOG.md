# @dxfeed/dxlink-protobuf-es

## 0.10.0

### Minor Changes

- a4e9244: Add `@dxfeed/dxlink-protobuf-es`, a runtime binding from protobuf-es service descriptors to the dxLink RPC transport. `createDXLinkService(client, service)` turns a generated `GenService` into a typed client whose methods return rxjs `Observable`s, and `createDXLinkDynamicService` does the same for descriptors resolved at runtime (for example from a `FileDescriptorSet`). Messages are exchanged as canonical protobuf-JSON over `@dxfeed/dxlink-rpc`; client-streaming methods are rejected at bind time, since the dxLink v1.0 wire has no graceful request half-close, unless `skipUnsupportedMethods` is set — which suits a descriptor picked at runtime, where one unsupported method should not make the rest of the service unreachable. The package is re-exported from `@dxfeed/dxlink-api`, so `@bufbuild/protobuf` joins `rxjs` as a peer dependency every `@dxfeed/dxlink-api` consumer has to install.
- baeddb0: Add the `keepUnresolvedAny` option to `jsonReadOptions` (`DXLinkJsonReadOptions`). Without it, a response that contains a `google.protobuf.Any` whose `@type` is not in `jsonReadOptions.registry` fails to decode, so one unknown payload type breaks the whole stream. With it, the rest of the message is decoded and each such `Any` is kept as `{ typeUrl }` with an empty `value`, at any depth (inside the payload of a resolved `Any` too), so the caller can treat it as unknown.

  Responses are now decoded with `ignoreUnknownFields: true` by default, so a server adding a field or an enum value no longer breaks older clients; an unknown enum value reads as the enum's zero value. Pass `jsonReadOptions: { ignoreUnknownFields: false }` to keep strict decoding.

### Patch Changes

- Updated dependencies [2aa0f0c]
- Updated dependencies [29774d4]
- Updated dependencies [04ce473]
  - @dxfeed/dxlink-core@0.10.0
  - @dxfeed/dxlink-rpc@0.10.0
