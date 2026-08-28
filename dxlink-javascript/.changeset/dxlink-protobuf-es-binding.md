---
'@dxfeed/dxlink-protobuf-es': minor
'@dxfeed/dxlink-api': minor
---

Add `@dxfeed/dxlink-protobuf-es`, a runtime binding from protobuf-es service descriptors to the dxLink RPC transport. `createDXLinkService(client, service)` turns a generated `GenService` into a typed client whose methods return rxjs `Observable`s, and `createDXLinkDynamicService` does the same for descriptors resolved at runtime (for example from a `FileDescriptorSet`). Messages are exchanged as canonical protobuf-JSON over `@dxfeed/dxlink-rpc`; client-streaming methods are rejected at bind time, since the dxLink v1.0 wire has no graceful request half-close, unless `skipUnsupportedMethods` is set — which suits a descriptor picked at runtime, where one unsupported method should not make the rest of the service unreachable. The package is re-exported from `@dxfeed/dxlink-api`.
