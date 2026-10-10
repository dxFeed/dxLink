---
'@dxfeed/dxlink-websocket-client': minor
'@dxfeed/dxlink-feed': minor
'@dxfeed/dxlink-core': patch
'@dxfeed/dxlink-dom': patch
'@dxfeed/dxlink-indichart': patch
'@dxfeed/dxlink-api': minor
---

Recover from connection failures before authorization, and report when the client stops connecting.

- `DXLinkWebSocketClient` used to give up for good, and drop the auth token, when the connection
  failed before the server answered authorization: a network error, a rejected handshake (such as
  an HTTP 503 from a capacity limit) or a connection blocked by the page's Content Security Policy.
  Channels stayed requested and their subscriptions were never sent. The client now reconnects in
  that case and keeps the token. It stops when the server refuses authorization, the protocol or
  the SETUP message, when the server requires a token, none is set and the server closes the
  connection, or when `maxReconnectAttempts` is reached.
- When the client stops connecting, the error goes to the client error listeners and to every
  channel that is not closed. Channels opened with `reconnect: false` are then closed; the others
  are requested again by the next successful `connect()`. With unlimited reconnect attempts (the
  default) a failure that may pass is retried without telling the channels: listen for client
  errors to show it.
- `DXLinkFeed` gains `addErrorListener` / `removeErrorListener`; without listeners, it logs the
  error as before. Adding the methods to `DXLinkFeedRequester` is a breaking change only for code
  that implements the interface itself.
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
