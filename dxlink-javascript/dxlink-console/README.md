# dxLink Debug Console

A protocol debug console for dxLink: open a WebSocket connection, authorize, open FEED,
DOM and INDICHART channels, and inspect what the protocol actually sends back. Point it at
a set of protobuf service definitions and it will call any RPC method in them too. Also
renders the dxLink AsyncAPI specification.

This is the modern rebuild of the console that shipped inside `@dxfeed/dxlink-docs`. The three
library packages are published to npm; the app itself is `private: true`, excluded from
Changesets, run locally, with no deployment. Core styles itself and reads no globals, so a host
can render the console inside a page it does not own — see [Embedding](#embedding).

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
| built-in defaults | 30/60/60 keepalive, no restriction on services, and **no URL** — deriving one means knowing how the console is deployed, which is the host's answer to give |
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

`channelKinds` restricts what a *deployment* offers out of the services this build has. Which
services the build has at all is a separate, earlier decision, made in `app/src/channels.ts`
by registering channel plugins — see ARCHITECTURE.md §8. Restricting `channelKinds` hides
add-buttons; not registering a plugin means its code is never imported. Kind names are open
strings, so the list is validated against the plugins actually registered: a name no plugin
provides is dropped with a warning.

Note `descriptorSetUrl` — and `locked: ['descriptorSetUrl']` — are read by the app and handed
to the RPC plugin rather than living on the core profile. The keys above are unchanged; the
profile core carries is just smaller than they suggest.

Bad values fall back to the layer below with a warning rather than taking the console down,
and unknown keys are ignored.

## Embedding

The console styles itself and nothing else, so it can be rendered inside a page it does not
own — a docs site, say. A host that has no MUI `ThemeProvider` of its own passes a theme, and
gets a self-contained console:

```tsx
import { ConsolePage, createConsoleTheme, builtinConsoleConfig } from '@dxfeed/dxlink-console-core'
import { rpcChannelPlugin } from '@dxfeed/dxlink-console-rpc'

<ConsolePage
  theme={createConsoleTheme()}
  config={{ ...builtinConsoleConfig(), wsUrl: 'wss://gateway.example.com' }}
  channels={[rpcChannelPlugin({ descriptorSetUrl: '/proto/docs' })]}
/>
```

Three things follow from that, and they are the whole of the theming contract:

- **The MUI reset is scoped to the console's own subtree** (`ScopedCssBaseline`), so the host
  page keeps its background, colour and font. A global `CssBaseline` would restyle the
  documentation around the console.
- **The font is inherited.** `createConsoleTheme()` sets `fontFamily: 'inherit'`, so the console
  reads as part of the page rather than a widget pasted into it. Pass
  `createConsoleTheme({ typography: { fontFamily: '…' } })` to override; overrides are
  deep-merged over the console's options, so derived values follow.
- **The host owns light/dark.** A console given a `theme` writes nothing to `<html>` and reads
  nothing from `localStorage`. It follows whatever class the host sets, because the theme selects
  color schemes by class and MUI's `'class'` selector is exactly what `next-themes`
  (`attribute="class"`) writes. So an embedded console renders no theme switcher — that control
  belongs to the host.

A host that already has a `ThemeProvider` above the page leaves `theme` out, and its own theme
applies; that is what the app does. See ARCHITECTURE.md §9 for why each of these is necessary
rather than merely tidy.

Install what you need. A docs site wanting the connection, auth and the RPC channel takes
`core` and `rpc` and never pulls the market-data dependency tree:

```sh
pnpm add @dxfeed/dxlink-console-core @dxfeed/dxlink-console-rpc
```

React, MUI and emotion are peer dependencies — the host provides them, so there is one React,
one theme context and one emotion cache. In Next.js, add the packages to `transpilePackages`
only if you consume them from source; the published builds need no transpilation. The console
is client-only, so render it from a `'use client'` component of your own.

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

Four packages, dependencies pointing downward — `app → {market-data, rpc} → core`:

| Package | |
| --- | --- |
| `core/` — `@dxfeed/dxlink-console-core` | Connection, auth, the channel-plugin registry, the configuration profile. No market-data anything. |
| `market-data/` — `@dxfeed/dxlink-console-market-data` | FEED, DOM and INDICHART. Brings dxcharts-lite, the dxScript editor and the data grid. Subpaths `/feed`, `/dom`, `/indichart` expose them one at a time. |
| `rpc/` — `@dxfeed/dxlink-console-rpc` | The RPC channel, over `@dxfeed/dxlink-protobuf-es`. |
| `app/` — `@dxfeed/dxlink-debug-console` | This app. Composes the three, and is the first consumer of the same contract any host would use. |

`core`, `market-data` and `rpc` are published, each with a tsup build to `build/` and dual
ESM/CJS behind a conditional `exports` map. The app is `private: true` and stays in the
Changesets `ignore` list. Because the app consumes the libraries' `build/` output rather than
their source, **`turbo run build` has to run before the dev server**, and a library edit needs
a rebuild to show up.

The point of the boundary: **core and rpc install no `@dxscript`, no dxcharts and no data
grid.** An RPC-only console depends on those two and never sees the market-data dependency
tree — the difference between hiding a button and not shipping a dependency. See
ARCHITECTURE.md §4 for the file-level layout and §8 for the plugin contract.

The app follows MVVM with **no global store**. Each ViewModel owns its dxlink-api object
as a private field and exposes UI state through its own Zustand store; views bind with
`useVM(vm, selector)` and call commands. Connection-level errors aggregate on the
connection ViewModel, channel-level errors stay on the channel that produced them.

This package replaced the console that shipped inside `@dxfeed/dxlink-docs`, which has
been deleted. Parity was signed off against live servers, and nothing is outstanding.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the design and [CLAUDE.md](./CLAUDE.md) for
how to validate a change against the dev servers.
