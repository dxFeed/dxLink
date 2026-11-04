---
'@dxfeed/dxlink-core': minor
'@dxfeed/dxlink-websocket-client': minor
'@dxfeed/dxlink-api': minor
---

Report connection failures with their own error types instead of `UNKNOWN`, so that an error type
tells where to look.

- `CONNECT_FAILED`: the connection could not be established. It did not open (network, DNS, TLS,
  proxy, Content Security Policy, invalid URL, handshake refused by the server), or it closed before
  the server authorized it.
- `CONNECTION_LOST`: an established (authorized) connection closed unexpectedly.
- `UNKNOWN` now only comes from the server, for an unexpected error on its side. The client used it
  for its own transport failures, which made a network or configuration problem on the client look
  like a server fault.

`DXLinkErrorType` is split into `DXLinkProtocolErrorType`, the types of the protocol ERROR message,
and `DXLinkClientErrorType`, the two new types, which the client never sends to the server. A
channel's `error()` accepts only protocol types. `DXLinkError` gains `closeCode`, the WebSocket close
code of the connection the error closed, and `final`, set on the error the client stops connecting
with.

The client also publishes a keepalive timeout as a `TIMEOUT` error; it used to reconnect silently.
A connection the runtime refuses to open, e.g. `ws://` from an https page or an invalid URL, stops
the client with a final `CONNECT_FAILED` error; it used to throw out of `connect()` and leave the
client connecting.

Breaking for code that matches `type === 'UNKNOWN'` to detect a connection failure: match
`CONNECT_FAILED` and `CONNECTION_LOST` instead. An exhaustive `switch` over `DXLinkErrorType` needs
the two new cases.
