# dxLink Debug Console

A protocol debug console for dxLink: open a WebSocket connection, authorize, open FEED,
DOM and INDICHART channels, and inspect what the protocol actually sends back. Also
renders the dxLink AsyncAPI specification.

This is the modern rebuild of the console that shipped inside `@dxfeed/dxlink-docs`. It
is an application, not a library: `private: true` and excluded from Changesets — nothing
here is published to npm. It is run locally; there is no deployment.

## Running

From the `dxlink-javascript` directory:

```sh
pnpm install
pnpm console          # or: pnpm --filter @dxfeed/dxlink-debug-console dev
```

The dev server listens on <http://localhost:4280>. The connection form is pre-filled with
the shared dev relay in development, and with a URL derived from `window.location` in
production builds.

> **Note:** `@dxscript/dxlink-dxcharts-lite` and `@dxscript/dxlink-dxscript-editor` are
> published only to dxFeed's internal registry, so `pnpm install` needs access to it.
> Without those credentials the package cannot be installed or built.
>
> The dev relay does **not** support the INDICHART service, so IndiChart channels are
> rejected there. Point the connection form at an endpoint that enables it to use them.

## Checks

```sh
pnpm --filter @dxfeed/dxlink-debug-console lint
pnpm --filter @dxfeed/dxlink-debug-console typecheck
pnpm --filter @dxfeed/dxlink-debug-console test
pnpm --filter @dxfeed/dxlink-debug-console build     # → build/
```

## Stack

React 19 · Vite · TypeScript (strict) · MUI v9 + MUI X DataGrid · Zustand (per-ViewModel
vanilla stores) · React Router v7 (`HashRouter`, so the app stays relocatable under any
sub-path) · Vitest + Testing Library.

## Layout

Feature-sliced, dependencies pointing downward — `app → pages → features → shared`:

```
src/
  app/         providers, theme, app shell, routes
  pages/       route-level compositions (console, protocol)
  features/    one slice per concern; ViewModel co-located with its views
    connection/  auth/  errors/  channels/  feed/  dom/  indichart/
  shared/      view-model helpers, cross-cutting components and lib
```

The app follows MVVM with **no global store**. Each ViewModel owns its dxlink-api object
as a private field and exposes UI state through its own Zustand store; views bind with
`useVM(vm, selector)` and call commands. Connection-level errors aggregate on the
connection ViewModel, channel-level errors stay on the channel that produced them.

This package replaced the console that shipped inside `@dxfeed/dxlink-docs`, which has
been deleted. Parity was signed off against live servers, and nothing is outstanding.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the design and [CLAUDE.md](./CLAUDE.md) for
how to validate a change against the dev servers.
