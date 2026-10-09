---
'@dxfeed/dxlink-websocket-client': minor
'@dxfeed/dxlink-feed': minor
'@dxfeed/dxlink-core': patch
'@dxfeed/dxlink-dom': patch
'@dxfeed/dxlink-indichart': patch
'@dxfeed/dxlink-api': minor
---

Recover from connection failures before authorization, and stop leaving channels waiting forever.

- `DXLinkWebSocketClient` used to give up for good, and drop the auth token, when the connection
  failed before the server answered authorization: a network error, a rejected handshake (such as
  an HTTP 503 from a capacity limit) or a connection blocked by the page's Content Security Policy.
  Channels stayed requested and their subscriptions were never sent. The client now reconnects in
  that case and keeps the token. It stops only when the server refuses authorization, or when
  `maxReconnectAttempts` is reached.
- When the client stops connecting, channels still waiting to open receive the error.
  `DXLinkFeed` gains `addErrorListener` / `removeErrorListener`; without listeners, it logs the
  error as before. Adding the methods to `DXLinkFeedRequester` is a breaking change only for code
  that implements the interface itself.
- Reconnect delays now back off exponentially from 1 second up to the new `maxReconnectDelay`
  option (30 seconds by default), randomized between half and full value. They used to grow by
  1 second per attempt without a limit.
- A clean WebSocket close (codes 1000, 1001 and 1005) is no longer reported as an `UNKNOWN` error
  with an empty message. Transport errors carry the close code, for example
  `Unable to connect (code 1006)`. `DXLinkWebSocketCloseListener` receives the close code as an
  optional third argument.
- Unhandled errors are logged with their type and message in the log text, so that log pipelines
  that stringify arguments no longer print `[object Object]`. This covers the client, channels,
  `DXLinkFeed`, `DXLinkDepthOfMarket` and `DXLinkIndiChart`. Client errors include the endpoint URL
  without credentials, query and fragment.
