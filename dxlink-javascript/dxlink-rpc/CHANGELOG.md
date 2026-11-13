# @dxfeed/dxlink-rpc

## 0.10.0

### Minor Changes

- 2aa0f0c: Modernize build tooling and packaging. Packages are now bundled with tsup (replacing microbundle) and ship dual ESM/CJS builds exposed through a conditional `exports` map (`import`/`require` with matching type declarations). This packaging change carries no API change of its own, and the standard entry points (`main`, `module`, `types`, `exports`) resolve as before.

### Patch Changes

- Updated dependencies [2aa0f0c]
- Updated dependencies [29774d4]
- Updated dependencies [04ce473]
  - @dxfeed/dxlink-core@0.10.0

## 0.9.0

### Patch Changes

- @dxfeed/dxlink-core@0.9.0

## 0.8.1

### Patch Changes

- feat(core): add `DXLinkChannelOptions` with `reconnect` flag to control channel behavior on connection drop
  feat(rpc): add `DxLinkRpcCallOptions` with `retry` flag for `requestResponse` and `requestStream`
  feat(rpc): refactor RPC internals — input subscription deferred to OPENED state with ReplaySubject support
  feat(indichart): update indicator parameter types to strict per-type interfaces (DOUBLE, STRING, BOOL, COLOR, SOURCE, SESSION, ENUM)
  feat(indichart): add support for timezone in session input parameter
  chore(rpc): remove redundant code
- Updated dependencies
  - @dxfeed/dxlink-core@0.8.1

## 0.8.0

### Minor Changes

- 185957f: feat(rpc): add rpc service support

### Patch Changes

- @dxfeed/dxlink-core@0.8.0
