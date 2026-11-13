# @dxfeed/dxlink-console-rpc

## 0.10.0

### Minor Changes

- a769503: Publish the dxLink console as libraries. `@dxfeed/dxlink-console-core` carries the connection,
  auth, the channel-plugin registry and the configuration profile; `-market-data` adds the FEED
  and DOM channels behind subpath exports (`/feed`, `/dom`); `-dxscript` adds the INDICHART
  channel; `-rpc` adds the RPC channel over `@dxfeed/dxlink-protobuf-es`. Each ships dual
  ESM/CJS builds through a conditional `exports` map, matching the rest of the workspace.

  `ConsolePage` renders inside a page it does not own: the MUI reset is scoped to its own
  subtree, the theme inherits the host's font, and a console given a `theme` writes nothing to
  `<html>` and reads nothing from `localStorage`, following whatever light/dark class the host
  sets. React, MUI and emotion are peer dependencies, since each has to be a single instance
  shared with the host.

### Patch Changes

- Updated dependencies [a769503]
- Updated dependencies [a4e9244]
- Updated dependencies [7caca72]
- Updated dependencies [2aa0f0c]
- Updated dependencies [baeddb0]
- Updated dependencies [29774d4]
- Updated dependencies [04ce473]
  - @dxfeed/dxlink-console-core@0.10.0
  - @dxfeed/dxlink-protobuf-es@0.10.0
  - @dxfeed/dxlink-api@0.10.0
