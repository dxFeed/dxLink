# CONTEXT

dxLink JavaScript API

## Public API naming
- Public interfaces and types are prefixed with `DXLink` to minimize symbol collisions in consumer code.

## Scheduler architecture
- `DXLinkWebSocketClient` owns a scheduler and exposes it via `getScheduler()`.
- Scheduler can be overridden through `DXLinkWebSocketClient` options; if not provided, `DefaultDXLinkScheduler` is created automatically.
- Services (for example `DXLinkFeed`) use `client.getScheduler()` instead of creating a standalone scheduler.
- Service scheduler keys must be instance-scoped (for example include channel id) to avoid collisions in a shared scheduler instance.

## Packages
- `@dxfeed/dxlink-api` re-exports public API from all dxlink JavaScript packages, except `dxlink-docs`.
