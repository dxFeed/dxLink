# dxlink-debug-console-foldkit — Architecture

The dxLink debug console built on [Foldkit](https://foldkit.dev): The Elm Architecture on
Effect. It offers the FEED, DOM and RPC channel services and mirrors the package layout of the
React console in [`../dxlink-console`](../dxlink-console), which stays the home of INDICHART.

For Foldkit's own conventions see [FOLDKIT.md](./FOLDKIT.md); for running and checking this
console see [README.md](./README.md).

```
VIEW      pure functions Model → Html           wires Messages, never runs effects
UPDATE    pure functions (Model, Message) → Model + Commands
RUNTIME   Commands · Subscriptions · ManagedResources · Resources   — the only place effects run
MODEL     @dxfeed/dxlink-api — DXLinkWebSocketClient, DXLinkFeed, …  (listener API)
```

## 1. One Model, and nothing live in it

The whole console is one Model: the connection form, the session, every open channel, every
request form. It holds plain data only — what can be rendered, compared and replayed by the
DevTools. A dxLink object is none of those things, so no client, feed or call is ever a Model
field. Each lives where Foldkit keeps things with a lifetime:

| Live object                       | Home                                                                  | Lifetime                             |
| --------------------------------- | --------------------------------------------------------------------- | ------------------------------------ |
| `DXLinkWebSocketClient`           | ManagedResource `DxLinkClient` (`core/src/client`)                    | while the Model holds a session      |
| a channel's feed / DOM / RPC call | the plugin's `ChannelHandles` service (a Resource)                    | from its Open Command to its Close   |
| a loaded protobuf registry (RPC)  | a store in the RPC plugin's Layer, addressed by an id the Model keeps | the most recently loaded few         |
| a candle chart and what it drew   | a per-channel sink, attached to its element by a Mount                | from the channel's Open to its Close |

Everything those objects report comes back as Messages: the client through a Subscription that
follows the open session, the channels through each plugin's event Stream.

## 2. Session and gating

`Session` is a tagged union — `Idle | Opening | Open` — and it is the client's requirements:
the ManagedResource acquires a client when the Model holds a session and releases it when it
does not. `sessionId` makes two sessions with identical parameters different, so **Connect**
always builds a fresh client, while **Reconnect** is a Command on the same one. The resource
carries the session id next to the client, and the Messages about it name the session they
belong to, so a client built for an earlier session cannot open or listen for a later one.

What is shown below the connection panel follows from the session alone:

- connected, and the server reports UNAUTHORIZED or AUTHORIZING → the auth panel;
- authorized now or earlier in this session → the channels area. Gating on "has ever been
  authorized" keeps the open cards through a reconnect, when the same client re-opens its
  channels itself;
- auth state not yet known → neither, so a server that needs no authorization never flashes a
  token form.

A new session starts with no channels: Connect and Disconnect close every open channel through
its plugin and drop the cards.

The auth token is `Redacted` in the Model, in its Message and in the Command that sends it, so
the DevTools record a placeholder rather than the token.

## 3. Package layout

```
dxlink-javascript/dxlink-console-foldkit/
  ARCHITECTURE.md · README.md · AGENTS.md · FOLDKIT.md

  core/        @dxfeed/dxlink-console-foldkit-core          no market-data anything
    src/index.ts             # the public surface, a barrel: console, plugin contract, host API, profile
    console.ts               # makeConsole — the console for a set of plugins
    model.ts · message.ts    # the console's Model and Messages
    update.ts · command.ts   # init/update and the Commands they return
    subscription.ts          # client listeners + the plugins' event Streams
    resource.ts · client.ts  # the DxLinkClient ManagedResource
    channel/                 # plugin.ts (contract) · handles.ts · parameters.ts · erased*.ts
    view/                    # connection panel · auth panel · channels area · channel card · errors
    kit.ts                   # the console's look, as view helpers shared with the plugins
    config.ts · error.ts     # configuration profile · error log

  market-data/ @dxfeed/dxlink-console-foldkit-market-data   dxcharts-lite
    src/index.ts             # both plugins; the /feed and /dom subpaths expose one at a time
    feed/ · dom/ · lib/

  rpc/         @dxfeed/dxlink-console-foldkit-rpc           @bufbuild/protobuf · dxlink-protobuf-es
    src/

  app/         @dxfeed/dxlink-debug-console-foldkit         the app; composes all of the above
    index.html · vite.config.ts
    src/       entry.ts · main.ts · channels.ts · theme.ts · styles.css
               · consoleConfig.ts          # resolves the profile + the RPC descriptor settings
               · consoleConfigSources.ts   # parses window.__DXLINK_CONFIG__ and location.search
               · connectionUrl.ts          # derives / chooses the WebSocket URL
```

Dependency direction is acyclic and enforced by the package boundary: `app → {market-data, rpc}
→ core`. All four packages are private and consumed **as source** (`exports` point at
`src/index.ts`), and that is deliberate: Foldkit's Vite plugin stamps the identity of every view
function at build time, so the views have to pass through the application's own build.

Each package is a Foldkit project in its own right — its own `tsconfig.json`, `.oxlintrc.json`
(the `@foldkit/oxlint-plugin` rules) and `vitest.config.ts`. Formatting is the repository's
Prettier.

## 4. Channel plugins

`makeConsole(plugins)` builds the console for a set of channel services. The channels area
knows nothing about FEED, DOM or RPC; each service is a `ChannelPlugin`
(`core/src/channel/plugin.ts`):

|                                 |                                                                    |
| ------------------------------- | ------------------------------------------------------------------ |
| `kind`, `label`, `iconPath`     | the add-button and the channel title                               |
| `dialogTitle`, `dialogWidth`    | the request dialog                                                 |
| `request` — a Submodel          | the request form: `init`, `update`, `view`, and `toConfig`         |
| `request.toConfig(request)`     | `Some(config)` exactly when "Open channel" is enabled              |
| `channel` — a Submodel          | one open channel: `init({ channelId, config })`, `update`, `view`  |
| `channel.summarize(channel)`    | the facts of the card header: subtitle, status, parameters, errors |
| `channel.close` / `clearErrors` | what the card's own buttons ask of the channel                     |
| `events`                        | a Stream of `{ channelId, message }` from the live channels        |

The card — header, error center, collapse and close — belongs to core and is the same for every
kind; a plugin's view is the body alone. What the user did with a card is one union,
`Open { isExpanded } | Closed`: closing is terminal, and the card stays as a record.

**Erasure is checked, not assumed.** The registry stores plugins without their types, so every
value that crosses the boundary is `unknown`: a channel's Model, a request, a Message.
`defineChannelPlugin` wraps each function of the plugin with the plugin's own guards, so a value
a plugin does not recognise is left alone rather than trusted. Config never crosses at all —
`open` goes from a request straight to a channel. The typed views are embedded through an
identity `h.submodel` boundary, which is what lets a view typed for its own Messages render
inside a builder typed for `unknown` ones.

**Live channels.** A plugin keeps its dxLink objects in a `ChannelHandles` service
(`makeChannelHandles`), addressed by the id of the channel's card. An Open Command reads the
client with `DxLinkClient.get`, creates the object, wires its listeners to `handles.emit`, and
`put`s it; later Commands look it up; closing `take`s it. `handles.events` is the plugin's event
Stream, and the plugin shapes it — batching high-frequency data so `update` and the view run a
few times a second rather than once per event, and stamping errors with the time they were
observed. The service is built by a Layer the app passes to the runtime as `resources`.

**Two filters, doing different jobs.** The registered plugins say which services exist in this
build, and the profile's channel kinds (§5) say which of those this deployment offers. The
second filters add-buttons only — an already-open channel keeps rendering.

## 5. Configuration profile

What a deployment can decide about a console before anyone opens it lives in one
`ConsoleConfig` (`core/src/config.ts`): the WebSocket URL, the keepalive timings, which channel
services are on offer, and which of those values the user may not change. Anything one channel
service needs is that plugin's option instead — the RPC descriptor-set URL is resolved in
`app/src/consoleConfig.ts` and handed to `rpcChannelPlugin()`.

It reaches `init` as Flags, seeds the Model once and is never written back. The exception is `locked`: a locked field
renders read-only rather than hidden, because in a debug console the endpoint you are talking
to is worth seeing even when you cannot change it.

Four sources, later winning:

```
built-in defaults  ←  app defaults  ←  window.__DXLINK_CONFIG__  ←  location.search
   (keepalive only:      (the URL:          (what a gateway            (?ws= &
    no URL, no           derived from       substituted into            descriptors= &
    service list)        the location,      index.html)                 channels=)
                         dev relay in
                         development)
```

Two rules make locking mean something: **only the injected config can lock**, and **a locked
field ignores its query parameter**. Both are structural in `resolveConsoleConfig`, which takes
every source already parsed.

**Core merges; app parses.** Reading `window.__DXLINK_CONFIG__` or a query string is a
standalone-deployment concern, so both readers live in `app/src/consoleConfigSources.ts`, and
`app/src/entry.ts` is the only module that touches globals or `import.meta.env`. The sources
decide two things there: which plugins exist and with what options, which is composition, and
the profile, which is the first Model's outside data and so travels as Flags.

## 6. Theming

Colours are Tailwind utilities in light and dark pairs, selected by a `dark` class on an
ancestor (`@custom-variant dark` in `app/src/styles.css`). The page owns the mode: the app's
root element carries the class, and the console — which sets none itself — only follows it.
The app keeps the user's choice (System / Light / Dark) in `localStorage`, reads it and the OS
preference as Flags before the first render, and follows later OS changes through a
Subscription.

`core/src/kit.ts` holds the palette and every shared control, so core and the channel packages
read as one surface. The console packages are consumed as source, so `styles.css` names their
`src` directories as Tailwind sources.
