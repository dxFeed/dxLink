# dxLink Debug Console

A protocol debug console for dxLink: open a WebSocket connection, authorize, open FEED,
DOM and INDICHART channels, and inspect what the protocol actually sends back. Point it at
a set of protobuf service definitions and it will call any RPC method in them too. Also
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
production builds — see [Configuration](#configuration) for how a deployment or a link
changes that.

> **Note:** `@dxscript/dxlink-dxcharts-lite` and `@dxscript/dxlink-dxscript-editor` are
> published only to dxFeed's internal registry, so `pnpm install` needs access to it.
> Without those credentials the package cannot be installed or built.
>
> The dev relay does **not** support the INDICHART service, so IndiChart channels are
> rejected there. Point the connection form at an endpoint that enables it to use them.

## Configuration

Everything the forms start with comes from one profile — WebSocket URL, keepalive timings,
descriptor-set URL, and which channel services are on offer. Four sources, later winning:

| Source | For |
| --- | --- |
| built-in defaults | An unconfigured console: the URL derived from the page location, 30/60/60 keepalive, all four services |
| the app | The one build-time choice — a development build points at the shared relay |
| `window.__DXLINK_CONFIG__` | A gateway serving this build, substituting the block in `index.html` at serve time. The only source that can pin a field |
| `location.search` | A link that carries a setup: `?ws=…`, `?descriptors=…`, `?channels=rpc,feed` |

A gateway that wants a console fixed to itself injects, say:

```js
window.__DXLINK_CONFIG__ = {
  wsUrl: 'wss://gateway.example.com',
  descriptorSetUrl: 'https://gateway.example.com/proto/docs',
  channelKinds: ['rpc'],
  locked: ['wsUrl', 'descriptorSetUrl'],
}
```

`locked` fields render read-only rather than hidden — you can still read the endpoint you
are talking to — and a locked field ignores its query parameter, so the pin holds. Only the
injected config can lock: a query parameter is written by whoever opened the link.

Bad values fall back to the layer below with a warning rather than taking the console down,
and unknown keys are ignored.

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
    connection/  auth/  errors/  channels/  feed/  dom/  indichart/  rpc/
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
