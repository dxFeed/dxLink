# dxLink Debug Console on Foldkit

A protocol debug console for dxLink built on [Foldkit](https://foldkit.dev): open a WebSocket
connection, authorize, open FEED and DOM channels, and inspect what the protocol actually sends
back. Point it at a set of protobuf service definitions and it will call any RPC method in them
too.

It sits next to the React console in [`../dxlink-console`](../dxlink-console) and follows the
same package layout — `core`, `market-data`, `rpc` and the `app` that composes them. INDICHART
is offered by the React console only. All four packages here are private: nothing is published,
and the app is run locally or built into static files a dxLink server can serve.

Design is in [ARCHITECTURE.md](./ARCHITECTURE.md); Foldkit's conventions are in
[FOLDKIT.md](./FOLDKIT.md).

## Running

From the `dxlink-javascript` directory:

```sh
pnpm install
pnpm turbo run build --filter '@dxfeed/dxlink-api...'
pnpm --filter @dxfeed/dxlink-debug-console-foldkit dev
```

The dev server listens on <http://localhost:4281>. The console packages are consumed as source,
so an edit in `core`, `market-data` or `rpc` reloads without a build. `@dxfeed/dxlink-api` is
consumed from its `build/` output, which is why it is built first.

The connection form is pre-filled with the shared dev relay in development, and with a URL
derived from `window.location` in production builds — see [Configuration](#configuration).

Foldkit DevTools are part of a development build: the overlay in the corner of the page lists
every Message with the Model before and after it.

## Checks

```sh
pnpm turbo run build lint test typecheck --filter './dxlink-console-foldkit/*'
```

`lint` is `oxlint` with the `@foldkit/oxlint-plugin` rules, followed by the Effect language
service's `recommended` diagnostics (`@effect/tsgo`) with warnings treated as errors; `test` is Vitest with Foldkit's
Story and Scene helpers, which drive `update` and the rendered view without a browser.
Formatting is the repository's Prettier (`pnpm run format`).

## Endpoints

One client serves the whole page, so every open channel shares the URL in the connection form.

| Service   | URL                                 |
| --------- | ----------------------------------- |
| FEED, DOM | `wss://dxlink-md-ws-dev.dxkube.com` |
| RPC       | a dxLink server that hosts it       |

The RPC channel also needs service definitions, and those come over HTTP rather than the socket:
a dxLink server publishes a `FileDescriptorSet` at `/proto/docs`. That endpoint sends no CORS
headers, so it can only be fetched same-origin — either the console is served by the same
server, or something local puts them on one origin. Failing that, load a descriptor set from a
file instead; `buf build -o descriptors.binpb` produces one.

## Configuration

Everything the forms start with comes from one profile — WebSocket URL, keepalive timings,
descriptor-set URL, and which channel services are on offer. Four sources, later winning:

| Source                     | For                                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| built-in defaults          | 30/60/60 keepalive, no restriction on services, and **no URL** — deriving one means knowing how the console is deployed, which is the host's answer to give |
| the app                    | The one build-time choice — a development build points at the shared relay                                                                                  |
| `window.__DXLINK_CONFIG__` | A gateway serving this build, substituting the block in `index.html` at serve time. The only source that can pin a field                                    |
| `location.search`          | A link that carries a setup: `?ws=…`, `?descriptors=…`, `?channels=rpc,feed`                                                                                |

A gateway that wants a console fixed to itself injects, say:

```js
window.__DXLINK_CONFIG__ = {
  wsUrl: 'wss://gateway.example.com',
  descriptorSetUrl: 'https://gateway.example.com/proto/docs',
  keepalive: { interval: 30, timeout: 60, acceptTimeout: 60 },
  channelKinds: ['rpc'],
  locked: ['wsUrl', 'descriptorSetUrl'],
}
```

`locked` accepts `wsUrl`, `keepalive` and `descriptorSetUrl`. Locked fields render read-only
rather than hidden — you can still read the endpoint you are talking to — and a locked field
ignores its query parameter, so the pin holds. Only the injected config can lock: a query
parameter is written by whoever opened the link.

`channelKinds` restricts what a _deployment_ offers out of the services this build has: `feed`,
`dom` and `rpc`. Which services the build has at all is decided in `app/src/channels.ts` by
registering channel plugins. A name no registered plugin provides is dropped with a warning,
and a list that leaves nothing is ignored.

Bad values fall back to the layer below with a warning rather than taking the console down, and
unknown keys are ignored.

## Building for a server

```sh
pnpm --filter @dxfeed/dxlink-debug-console-foldkit build
```

writes static files to `app/build`. The build uses an empty `base`, so it can be served from any
sub-path; served under `…/debug`, the console derives the WebSocket URL of the endpoint it sits
next to.
