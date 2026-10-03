# CONTEXT

dxLink JavaScript API

## Public API naming

- Public interfaces and types are prefixed with `DXLink` to minimize symbol collisions in consumer code.

## Constants style

- Prefer `as const` for constants where literal narrowing is useful.
- Name constants in `UPPER_SNAKE_CASE`.

## Scheduler architecture

- `DXLinkWebSocketClient` owns a scheduler and exposes it via `getScheduler()`.
- Scheduler can be overridden through `DXLinkWebSocketClient` options; if not provided, `DefaultDXLinkScheduler` is created automatically.
- Services (for example `DXLinkFeed`) use `client.getScheduler()` instead of creating a standalone scheduler.
- Service scheduler keys must be instance-scoped (for example include channel id) to avoid collisions in a shared scheduler instance.

## Packages

- `@dxfeed/dxlink-api` re-exports public API from all dxlink JavaScript protocol packages. The `dxlink-console/*` packages are not re-exported: they are UI libraries built on top of `@dxfeed/dxlink-api`.

## Learning more about Effect

This repository uses the Effect TypeScript library — in the console packages (`dxlink-console/*`).

Before writing any Effect code, first read `node_modules/effect/AGENTS.md` **completely**, and
follow the links in the file when required.

If you need to learn more about particular Effect APIs and concepts that the guide doesn't cover,
search through the source code in `node_modules/effect/src`.

Both paths resolve from this directory: the workspace root lists `effect` as a dev dependency for
exactly that, at the same version the console packages use. Keep the two ranges in step, so the
guide you read is the Effect you are writing against.

## Development Commands

- Run commands from `dxlink-javascript` directory.
- Verify everything (build + test + lint):
  - `npm run build`
  - `npm run test`
  - `npm run lint`
- Format all supported files:
  - `npm run format`
- Lint with auto-fix across packages:
  - `npm run lint:fix`
