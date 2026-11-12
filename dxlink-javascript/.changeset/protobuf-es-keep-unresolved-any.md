---
'@dxfeed/dxlink-protobuf-es': minor
---

Add the `keepUnresolvedAny` option to `jsonReadOptions` (`DXLinkJsonReadOptions`). Without it, a response that contains a `google.protobuf.Any` whose `@type` is not in `jsonReadOptions.registry` fails to decode, so one unknown payload type breaks the whole stream. With it, the rest of the message is decoded and each such `Any` is kept as `{ typeUrl }` with an empty `value`, at any depth (inside the payload of a resolved `Any` too), so the caller can treat it as unknown.

Responses are now decoded with `ignoreUnknownFields: true` by default, so a server adding a field or an enum value no longer breaks older clients; an unknown enum value reads as the enum's zero value. Pass `jsonReadOptions: { ignoreUnknownFields: false }` to keep strict decoding.
