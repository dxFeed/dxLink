# @dxfeed/dxlink-feed

## 0.10.0

### Minor Changes

- 7caca72: Expose the active subscriptions of a feed channel. `DXLinkFeedRequester` gains
  `getSubscriptions()`, which returns the subscriptions the channel currently holds — the ones it
  also replays after a channel re-open — and the union type behind them is now public as
  `DXLinkFeedSubscription`. Adding the method to `DXLinkFeedRequester` is a breaking change only
  for code that implements the interface itself; consumers of `DXLinkFeed` are unaffected.
- 2aa0f0c: Modernize build tooling and packaging. Packages are now bundled with tsup (replacing microbundle) and ship dual ESM/CJS builds exposed through a conditional `exports` map (`import`/`require` with matching type declarations). This packaging change carries no API change of its own, and the standard entry points (`main`, `module`, `types`, `exports`) resolve as before.

### Patch Changes

- 29774d4: Recover from connection failures before authorization, and report when the client stops connecting.

  - `DXLinkWebSocketClient` used to give up for good, and drop the auth token, when the connection
    failed before the server answered authorization: a network error, a rejected handshake (such as
    an HTTP 503 from a capacity limit) or a connection blocked by the page's Content Security Policy.
    Channels stayed requested and their subscriptions were never sent. The client now reconnects in
    that case and keeps the token. It stops when the server refuses authorization, the protocol or
    the SETUP message, when the server requires a token, none is set and the server closes the
    connection, or when `maxReconnectAttempts` is reached.
  - When the client stops connecting, the error goes to the client error listeners and to every
    channel that is not closed. Channels opened with `reconnect: false` are then closed; the others
    are requested again by the next successful `connect()`. A service such as `DXLinkFeed` logs it;
    listen on its channel, e.g. `feed.getChannel().addErrorListener()`, to handle it. With unlimited
    reconnect attempts (the default) a failure that may pass is retried without telling the channels:
    listen for client errors to show it.
  - Reconnect delays now back off exponentially from 1 second up to the new `maxReconnectDelay`
    option (30 seconds by default), randomized between half and full value. They used to grow by
    1 second per attempt without a limit. The delay and the attempt count start over once the
    connection is authorized, not when the server answers SETUP. `maxReconnectDelay` is a required
    member of `DXLinkWebSocketClientConfig`, which breaks only code that builds a complete config
    object instead of passing a partial one to the constructor.
  - A channel opened with `reconnect: false` that is closed because the connection failed receives
    the error first, so that, for example, an RPC call fails instead of completing empty.
  - A clean WebSocket close (codes 1000, 1001 and 1005) of an authorized connection without a
    reason is no longer reported as an `UNKNOWN` error with an empty message. Transport errors carry
    the close code, for example `Unable to connect (code 1006)`. `DXLinkWebSocketCloseListener`
    receives the close code as an optional third argument, and the client now honors its `error`
    flag: a custom connector must pass `true` for a close it considers abnormal.
  - Unhandled errors are logged with their type and message in the log text, so that log pipelines
    that stringify arguments no longer print `[object Object]`. This covers the client, channels,
    `DXLinkFeed`, `DXLinkDepthOfMarket` and `DXLinkIndiChart`. Client errors include the endpoint URL
    without credentials, query and fragment.

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

### Patch Changes

- @dxfeed/dxlink-core@0.8.0

## 0.7.0

### Minor Changes

- Update API of Indichart to latest server version

### Patch Changes

- Updated dependencies
  - @dxfeed/dxlink-core@0.7.0

## 0.6.1

### Patch Changes

- Add `feed` and `source` for FEED selection
  - @dxfeed/dxlink-core@0.6.1

## 0.6.0

### Patch Changes

- @dxfeed/dxlink-core@0.6.0

## 0.5.1

### Patch Changes

- @dxfeed/dxlink-core@0.5.1

## 0.5.0

### Minor Changes

- feed: add ability to specify space for the feed data

### Patch Changes

- @dxfeed/dxlink-core@0.5.0

## 0.4.0

### Minor Changes

- Finalize Indichart API and Improve protocol selection for the WebSocket Client

### Patch Changes

- Updated dependencies
  - @dxfeed/dxlink-core@0.4.0

## 0.3.0

### Minor Changes

- Bugfix: incorrenct behaviour with `feed.configure`

### Patch Changes

- Updated dependencies
  - @dxfeed/dxlink-core@0.3.0

## 0.2.0

### Minor Changes

- Depth Of Market API support

### Patch Changes

- Updated dependencies
  - @dxfeed/dxlink-core@0.2.0

## 0.1.3

### Patch Changes

- Update descriptions
- Updated dependencies
  - @dxfeed/dxlink-core@0.1.3

## 0.1.2

### Patch Changes

- Bugfix: typo in listeners
- Updated dependencies
- Updated dependencies
  - @dxfeed/dxlink-core@0.1.2

## 0.1.1

### Patch Changes

- Add basic usage in readme
- Updated dependencies
  - @dxfeed/dxlink-core@0.1.1

## 0.1.0

### Minor Changes

- Upgrade dxLink API to SDK level
  - Rework for better performance and stability
  - DXLinkFeed: add batching & splitting of the subscription requests

### Patch Changes

- Updated dependencies
  - @dxfeed/dxlink-core@0.1.0
