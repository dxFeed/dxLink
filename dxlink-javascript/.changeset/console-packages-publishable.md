---
'@dxfeed/dxlink-console-core': minor
'@dxfeed/dxlink-console-market-data': minor
'@dxfeed/dxlink-console-rpc': minor
---

Publish the dxLink console as libraries. `@dxfeed/dxlink-console-core` carries the connection,
auth, the channel-plugin registry and the configuration profile; `-market-data` adds the FEED,
DOM and INDICHART channels behind subpath exports (`/feed`, `/dom`, `/indichart`); `-rpc` adds
the RPC channel over `@dxfeed/dxlink-protobuf-es`. Each ships dual ESM/CJS builds through a
conditional `exports` map, matching the rest of the workspace.

`ConsolePage` renders inside a page it does not own: the MUI reset is scoped to its own
subtree, the theme inherits the host's font, and a console given a `theme` writes nothing to
`<html>` and reads nothing from `localStorage`, following whatever light/dark class the host
sets. React, MUI and emotion are peer dependencies, since each has to be a single instance
shared with the host.
