# dxlink-debug-console — Architecture

Design for the `@dxfeed/dxlink-debug-console` rebuild. For how to validate a change see
[CLAUDE.md](./CLAUDE.md); for what is still open see [README.md](./README.md).

The console follows **MVVM**, built on [Effect 4](https://effect.website). There is **no global
store**: each dxLink object is wrapped in a _model_ — a bundle of atoms — and every atom's value
lives in the page's own registry.

```
VIEW         MUI + React components — declarative, dumb
   │  useAtomValue ▲          useAtomSet ▼          (@effect/atom-react)
MODEL        atoms — state, commands, and one session (effect/reactivity)
   │  scoped Effect ▲             acquires ▼
DXLINK       @dxfeed/dxlink-api — DXLinkWebSocketClient, DXLinkFeed, … (listener API)
```

## 1. Models

Every dxlink-api entity is wrapped in a **model** — a plain object of atoms, made by a
`make…Model` function:

- **state** is writable atoms (`Atom.make(initial)`), one per thing a view shows, so a view
  re-renders only for the atoms it reads;
- **commands** are write-only atoms (`command()` in `core/src/lib/model.ts`) that a view calls
  through `useAtomSet`;
- **one session** holds the dxLink object open: an atom whose value is computed by a **scoped
  Effect**. Everything that Effect acquires — the dxLink object itself
  (`Effect.acquireRelease`), its listeners (`on` / `listen`), the fibers that drain them
  (`Effect.forkScoped`) — belongs to the atom's `Scope`, and is released with it.

The session replaces the ViewModel's hand-written `start()` / `stop()` pair. Nothing has to be
torn down in the mirror image of how it was set up: the scope closes in reverse order of
acquisition, a listener is removed by the same `acquireRelease` that added it, and a fiber
draining a stream is interrupted with the scope it was forked into.

Models:

- **`makeConnectionModel`** (page-scoped) — holds the `DXLinkWebSocketClient`; state:
  `connection · auth · details · errors · sessionId · everAuthorized · client`; commands:
  `connect / reconnect / disconnect / setAuthToken / clearErrors`.
- **`makeFeedModel` / `makeDomModel` / `makeFeedCandlesModel` / `makeIndiChartModel` /
  `makeRpcModel`** — one per open channel. Each carries a `ChannelAtoms` (`core/src/lib/channel.ts`):
  the channel's state, id, parameters and errors, plus `closed` / `close` — what every card
  header shows, bound in one line by `useChannelCard`. The card keeps no state of its own about
  closing: `ChannelWidget` shows `closed` as the model holds it.

The four models over a dxLink channel object (Feed, DOM, candles, IndiChart) hold it through
`channelSession`, which does what they share — holds nothing once the channel is closed, opens
and closes the object, follows its protocol channel for the card, keeps the card's atoms alive —
so a model states only its own: which object to open, which extra atoms it writes, and how its
listeners `wire` into them. RPC is a plain `session`: the transport opens its channel, so there
is no object to hand over, and it fills only the card atoms a call has (parameters, errors).

Views bind directly; there is no selector plumbing and no `useEffect` listener wiring:

```ts
const [model] = useState(() => makeFeedModel(client, params)) // pure: atoms only describe
useSession(model.session) // holds the feed open while mounted
const events = useAtomValue(model.events) // re-renders only on this atom
const addSubscription = useAtomSet(model.addSubscription)
```

## 2. Ownership, lifecycle & scope (nothing global but the theme)

```
main.tsx
└── <ThemeProvider>                         ← GLOBAL (theme spans all routes)
    └── <HashRouter>                        ← hash routing + Vite base:'' (sub-path/static hosting)
        ├── "/"  <ConsolePage>              makeConnectionModel() ← created & owned here
        │     └── <RegistryProvider>        ← the page's atom registry (PAGE-SCOPED)
        │           └── <ConnectionProvider value={model}>   ← context scoped to this page;
        │                 │                   useSession(model.session) holds the client
        │                 ├── <ConnectionPanel>   useAtomValue(model.connection)
        │                 ├── <AuthPanel>         useAtomValue(model.auth)
        │                 └── <ChannelsArea>      open channels (React state)
        │                       └── <FeedChannel>   makeFeedModel(client, …) · useSession
        └── "/protocol" <AsyncApiViewer>      ← independent, no model
```

- **The registry is the page's.** `ConsolePage` renders its own `RegistryProvider`, so every
  atom the console reads lives and dies with the page — the client is closed when the page
  unmounts, exactly as before — and a host's own registry, if it has one, is neither read nor
  written. Two consoles on one page share nothing.
- **Sessions follow the atom's lifetime.** A session is open while something observes its atom
  (`useSession` does), and is released when nothing has for the registry's idle TTL, or when an
  atom its Effect read changes — `channel.closed` for a channel, the connect request for the
  connection — which closes it and opens the next.
- **StrictMode-safe by construction.** Creating a model is pure — `useState(() => make…Model())`
  may run twice, and the discarded copy never opened anything. React 19's mount → unmount →
  remount happens before the registry releases an unobserved atom, so the remount finds the
  session still open: one channel, never two. (The page's `IDLE_TTL` is margin on top of that.)
- **A model's state outlives a closed session.** A session mounts the atoms it writes for as long
  as it is open — the registry drops an atom nobody observes, and with it a value written while
  no view was reading — and a closed channel keeps its last values for the card that shows it.
- **Commands reach the dxLink object through `session.current()`**, which never opens one. A
  command run with no session open updates its atoms and leaves the wire alone, which is what lets
  a form be tested without a socket.
- **Channel identity:** each open channel gets a **synthetic client-side id** from the channels
  area, for React keys and the card title. Do **not** key on `DXLinkChannel.id` — for IndiChart it
  is `undefined` until a subscription is set.
- **Error scoping:** connection-level errors aggregate on the connection model's `errors`;
  **channel-level errors stay on their channel model** (surfaced in the `ChannelWidget`). A
  session that fails to open — a dxLink constructor that throws — is rethrown by `useSession`
  during render, so the card's error boundary contains it.
- **Connection params are not persisted** — the theme is the only thing that survives a
  reload. They come instead from the configuration profile (§7), which a host supplies and
  the forms start from. **Tab-nav lifecycle: page-scoped** — navigating `/`→`/protocol`
  unmounts the page and closes the socket, reconnect on return.

## 3. Reactive data flow (one model — same shape for all)

```
            ┌──────────────── dxlink-api entity (e.g. DXLinkFeed) ────────────────┐
            │  add*Listener(...)  ◀── registered in the session's own fiber        │
            └─────────────────────────────────────────────────────────────────────┘
                       │  events / state-change / config-change / errors
                       ▼
        ┌──────────────────────── feed session (scoped Effect) ───────────┐
        │  • on(feed, 'ConfigChange', …)  → registry.set(config, …)       │
        │  • listen(feed, 'Event') → Stream.groupedWithin(…, 100 millis)  │
        │      → Stream.runForEach(Atom.update(events, …)) · forkScoped   │
        │  • trackChannel → channel state, id, parameters, errors         │
        └───────▲─────────────────────────────────────────────┬───────────┘
                │ useAtomValue(model.events)                   │ useAtomSet(model.addSubscription)
                │ (re-renders only on that atom)               │ → session.current()?.addSubscriptions
        ┌───────┴─────────────────────────────────────────────▼─────────────┐
        │  MUI views: <EventsTable> (DataGrid), <ConfigurationSection>,       │
        │             <SubscriptionManager>                                   │
        └─────────────────────────────────────────────────────────────────────┘
```

Two ways in from a listener, for two kinds of data:

- **`on(target, name, f)`** — call `f` for each notification, for the scope's lifetime. For what
  changes rarely (channel state, configuration) and should land at once.
- **`listen(target, name)`** — the same notifications as a `Stream`, for data that wants stream
  operators. High-frequency data (feed events, DOM snapshots, RPC responses) is coalesced with
  `Stream.groupedWithin(…, FLUSH_INTERVAL)` and written once per window (~10fps).

Both register **in the session's own fiber**, never in a forked one. A Stream built with
`Stream.callback` only registers once a forked consumer first pulls it — a scheduler tick later —
and a channel can be answered within that tick: an OPENED state missed there is never sent again.
`listen` therefore registers immediately and buffers into a queue the forked consumer drains.

Neither lets a callback throw into the dxLink dispatch, which does not guard its listeners — a
throw there would abort the frame for every other channel. Chart data is the exception to "state
goes to atoms": a chart consumes batches in order through a ref, so the candle and IndiChart
models hand them to a callback the view supplies, and the view reports a chart that throws as a
chart error on that card.

The RPC model takes its responses from an rxjs `Observable` rather than a listener, and turns its
notifications into data — next, error and complete — so a failure travels through the same
coalescing window, after every response that preceded it, instead of overtaking them.

## 4. Package layout

The console is an **umbrella of five packages**. Four are libraries a host composes; the
fifth is the app that composes them for us and is the first consumer of the same contract
any other host would use.

```
dxlink-javascript/dxlink-console/
  ARCHITECTURE.md · README.md · CLAUDE.md · tsconfig.base.json

  core/        @dxfeed/dxlink-console-core        no market-data anything
    src/index.ts                 # the public surface: page, plugin contract, host API, profile
    console-page.tsx             # page registry + connection model + providers; connection/auth/channels
    channels/
      plugin.ts                  # ChannelPlugin contract + defineChannelPlugin (§8)
      types.ts                   # DraftChannel — { id, kind, config: unknown }
      channels-area.tsx          # registry-driven: add-buttons, request dialog, open channels
      channel-widget.tsx         # the collapsible card every channel body sits in
    connection/                  # connection-model · connection-context · connection-panel
    auth/ · errors/
    components/                  # error-boundary
    lib/                         # model (session, on, listen, command) · channel · console-config(+context)
                                 # · timestamped-error

  market-data/ @dxfeed/dxlink-console-market-data   dxcharts-lite · x-data-grid
    src/index.ts                 # both plugins; subpaths below expose them one at a time
    feed/       plugin.tsx · types.ts · feed-model · feed-candles-model · feed-channel
                · feed-channel-request · feed-chart-channel · candle-chart · feed-configuration
                · feed-subscriptions · feed-events-table · candles · sorted-list · event-types
    dom/        plugin.tsx · types.ts · dom-model · dom-channel · dom-channel-request
    lib/        order-sources.ts · color-scheme.ts
    components/ doc-link.tsx     # see below: a plugin package carries its own UI helpers

  dxscript/    @dxfeed/dxlink-console-dxscript    @dxscript editor · @dxscript dxcharts-lite
    src/       index.ts · plugin.tsx · types.ts · indichart-model · indichart-channel
               · indichart-channel-request · parameter-field · session-parameter-field
               · script-error · colors · session · doc-urls · color-scheme · doc-link

  rpc/         @dxfeed/dxlink-console-rpc          @bufbuild/protobuf · dxlink-protobuf-es
    src/       index.ts · plugin.tsx · types.ts · rpc-model · rpc-channel
               · rpc-channel-request · descriptors.ts

  app/         @dxfeed/dxlink-debug-console        the app; composes all of the above
    index.html · vite.config.ts
    src/       main.tsx · App.tsx · routes.tsx · theme.ts · channels.ts · protocol-page.tsx
               · console-config.ts        # resolves the profile + the RPC descriptor settings
               · console-config-sources.ts # parses window.__DXLINK_CONFIG__ and location.search
               · connection-url.ts        # derives / chooses the WebSocket URL
               · components/{dxfeed-logo,theme-mode-toggle}
```

The four libraries are published; the app is not. Each library follows the same packaging as
the rest of the workspace: a tsup build to `build/`, dual ESM/CJS behind a conditional
`exports` map, and `files: ["/build", "/package.json"]`. React, MUI, emotion, `effect` and
`@effect/atom-react` are **peer** dependencies, because each has to be one instance shared
with the host — a second React breaks the hooks, a second MUI theme context leaves the console
unstyled, a second emotion cache loses the styles, and a second `@effect/atom-react` gives a
channel package a registry context the page never provided, so its atoms would live outside
the page that is meant to own them.

The cost of that is paid in development: the app now consumes `build/`, not `src/`, so a
`turbo run build` has to precede running it and a library edit needs a rebuild to appear.
That is deliberate — the alternative, a `publishConfig` override keeping `main` on the source
in-repo, was considered and dropped in favour of manifests that say exactly what they publish.

`dxscript` is the one deviation: it declares `sideEffects: ["*.css"]` rather than `false`,
because `indichart-channel.tsx` imports the `@dxscript` chart's stylesheet and a bundler told
the package is side-effect-free may drop that import. It is the only package here that
imports CSS at all — vanilla dxcharts-lite takes its colours as config rather than from a
stylesheet, which is what lets `market-data` declare `false` outright.

Dependency direction (acyclic, and enforced by the package boundary rather than by
convention): `app → {market-data, dxscript, rpc} → core`. Nothing points back up. Unit tests sit beside
what they test as `*.test.ts(x)`; each library package carries its own `vitest.config.ts` and
`src/test/setup.ts`.

**Each channel package exports a descriptor**, as this design always intended: `plugin.tsx`
declares a `ChannelPlugin` and `app/src/channels.ts` aggregates them, so `ChannelsArea`
renders channels without importing any of them. Adding a channel kind = a plugin + a line at
the composition site. The one departure from the original sketch is the layer: the descriptor
registers _UI_ per service (add-button, request form, channel body) rather than teaching
the connection model how to open channels, because each channel model already opens its own
channel off the client it is handed. §8 has the contract.

**Core receives; it never reaches.** It reads no globals, no `import.meta.env`, no
`localStorage`; it holds no hostname, and it names no channel service. Everything about how a
console is deployed — which endpoint, which services, what a link may override, what a gateway
pinned — arrives as props. What that cost: `connection-url.ts` and the two source parsers live
in app, and `ConsolePage` takes both `config` and `channels` as **required** props rather than
guessing either. §7 has the profile.

**A channel package is self-contained**, which is the same rule read from the other side. Its
only dependency here is core's published surface — the plugin contract, `ChannelWidget`, the
connection hooks — and it reaches for nothing else, including nothing in a sibling channel
package. The visible cost is that `doc-link.tsx`, `color-scheme.ts` and two documentation URLs
exist in more than one package. That is the intended trade: the alternative is either a
dependency between channel packages, which would make registering one plugin install another's
tree, or core accumulating helpers that exist only to serve channels — and core is what every
host installs. A few dozen duplicated lines are cheaper than either.

What the split buys, concretely: **only `dxscript` installs `@dxscript`, and only
`market-data` installs dxcharts-lite and the data grid.** A host that wants an RPC-only
console depends on `core` and `rpc` and sees neither tree — the difference between filtering
a button and not shipping a dependency. The dxScript editor is the sharpest case: it is the
heaviest thing the console can pull, nothing but INDICHART uses it, and after the split a
FEED-and-DOM console never resolves it. Within market-data, the `/feed` and `/dom` subpaths
keep the same granularity for the bundle.

## 5. Schema-driven indicator parameter form

The IndiChart in/out parameters (`DOUBLE | STRING | BOOL | COLOR | SOURCE | SESSION | ENUM`)
become a single dynamic renderer driven by parameter metadata → a zod schema built at
runtime → react-hook-form. SESSION keeps its dedicated dialog (interval/raw modes, day
selection, timezone). COLOR keeps the dxScript color-name ⇄ hex mapping.

## 6. UI/UX design

### 6.1 Stock-MUI mapping (what we use instead of custom UI)

| Current custom piece                  | Stock MUI replacement                       |
| ------------------------------------- | ------------------------------------------- |
| `ContentTemplate` / `Paper` panels    | `Card` + `CardHeader` + `CardContent`       |
| `TextField` wrapper, `Select` wrapper | `TextField`, `Select` / `Autocomplete`      |
| Connection status dot                 | `Chip` (color by state)                     |
| Errors dropdown                       | `Alert` / `Snackbar` + `Menu`/`Popover`     |
| Buttons / icon buttons                | `Button`, `IconButton` + `Tooltip`          |
| Channel widget shell                  | `Card` + `Accordion` (collapsible) + `Tabs` |
| Dialogs (e.g. SESSION editor)         | `Dialog`                                    |
| Feed/DOM tables                       | `@mui/x-data-grid` (`DataGrid`)             |
| Forms layout                          | `Grid` / `Stack`                            |
| Genuine gaps → keep custom            | JSON view; CodeMirror editor wrapper        |

### 6.2 UX improvements (over current console)

- Theme follows the OS by default (`prefers-color-scheme`); in-app control to switch System / Light / Dark, persisted to localStorage (current app is light-only).
- Shareable URL state for the connection and definitions endpoints (§7). Persisted connection presets and last-used params are still open.
- Connection status as a clear badge; explicit reconnect control.
- Live feed tables: virtualized, **pause/resume** + **clear**, copy-row-as-JSON, throttled.
- Collapsible/reorderable channel panels.
- Error center: timestamped, grouped by source (connection vs channel), dismissible.
- Full keyboard accessibility and responsive layout (MUI a11y baseline).

## 7. Configuration profile

What a deployment can decide about a console before anyone opens it lives in one
`ConsoleConfig` (`core/src/lib/console-config.ts`): the WebSocket URL, the keepalive timings,
which channel services are on offer, and which of those values the user may not change.

Deliberately small, and it stays small. Anything one channel service needs is that plugin's
option instead — the RPC descriptor-set URL, and whether a host pinned it, are resolved in
`app/src/console-config.ts` and handed to `rpcChannelPlugin()`, so core grows no vocabulary
for services it knows nothing about. `channelKinds` is `null` by default, meaning every
registered plugin: with an open kind vocabulary there is no fixed list to enumerate, so
"unrestricted" has to be its own value rather than a list that happens to name everything.

**It seeds initial state; it does not own state.** Each value is read once, into the local
draft state of the form that owns it, and is never written back — the user stays free to
edit. The one exception is `locked`, which is how a host says a field is fixed rather than
merely suggested; a locked field renders read-only rather than hidden, because in a debug
console the endpoint you are talking to is worth seeing even when you cannot change it.

Four sources, later winning:

```
built-in defaults  ←  app defaults  ←  window.__DXLINK_CONFIG__  ←  location.search
   (keepalive only:      (the URL:          (what a gateway            (?ws= &
    no URL, no           derived from       substituted into            descriptors= &
    service list)        the location,      index.html)                 channels=)
                         dev relay in
                         development)
```

Two rules make locking mean something: **only the injected config can lock** (a query
parameter is written by whoever opened the link, so letting it pin — or unpin — a field
would make locking a lie), and **a locked field ignores its query parameter**.

**Core merges; app parses.** `resolveConsoleConfig` owns the precedence and the lock rules and
takes every source already parsed. Reading `window.__DXLINK_CONFIG__` or a query string is a
standalone-deployment concern, so both readers live in `app/src/console-config-sources.ts`
along with their validation — a host that passes props uses neither.

That split moved one invariant, and it had to be put back deliberately: "only the injected
config can lock" used to hold because the query-string parser simply never read a `locked`
parameter. With sources arriving pre-parsed, `resolveConsoleConfig` now strips `locked` from
the search layer itself, so the rule is structural rather than a property of whoever parsed.

`app/src/console-config.ts` and `app/src/connection-url.ts` are the only places that read
globals or `import.meta.env`. Core reaches for nothing: `ConsolePage` requires both `config`
and `channels` as props, so there is no fallback path that could quietly guess an endpoint.

## 8. Channel registry

The descriptor §4 describes, in full. `ChannelsArea` knows nothing about FEED, DOM,
INDICHART or RPC; each service is a `ChannelPlugin` (`core/src/channels/plugin.ts`) carrying
everything the area used to hardcode as a four-way switch:

|                                 |                                                                |
| ------------------------------- | -------------------------------------------------------------- |
| `kind`, `label`, `icon`         | the add-button, the channel title, the error-boundary name     |
| `dialogTitle`, `dialogMaxWidth` | the request dialog                                             |
| `createRequest()`               | the value the request form starts from, seeded once per plugin |
| `RequestForm`                   | the form itself, `{ value, onChange }`                         |
| `canOpen?(request)`             | whether "Open channel" is enabled                              |
| `buildConfig(request)`          | request → channel config, or `null` when it cannot be opened   |
| `Channel`                       | the opened channel, `{ title, config }`                        |

Plugins reach the connection through `useConnection()` — or `useConnectionClient()` for the
live client a channel model opens its channel on — and build their models from what
`@dxfeed/dxlink-console-core` exports for it: `channelSession` (or `session`, for a channel the
plugin does not hold an object for), `on`, `listen`, `command`, and `makeChannelAtoms` /
`useChannelCard` for the card. That is the whole host API; there is no plugin-specific context.

`DraftChannel.config` is `unknown`. It was produced by the plugin named by `kind` and is only
ever handed back to that same plugin, so no config type — and no config _dependency_ — needs
to reach this feature. That is what keeps `@bufbuild/protobuf`, dxcharts and the dxScript
editor out of core altogether. The types are checked inside each plugin, by
`defineChannelPlugin`, which is also the single place the erasure happens.

`ConsolePage` and `ChannelsArea` take the plugin list as a **required** prop, never a default:
which services exist is a composition decision (`app/src/channels.ts`), not something a component
should assume. A console that should not offer market data leaves those plugins out and never
imports their code — the difference between filtering a button and not shipping a dependency.

Two filters, doing different jobs: the registered plugins say which services exist in this
build, and the profile's `channelKinds` (§7) says which of those this deployment offers. The
second filters add-buttons only — an already-open channel keeps rendering, so a profile that
disagrees with what is on screen degrades instead of crashing.

## 9. Theming boundary

The console is embeddable only if it styles itself and nothing else. Three things had to be
true for that, and each is a place where MUI's defaults are built for an application that owns
its page rather than a component dropped into someone else's.

**The reset is scoped.** `ConsolePage` renders `ScopedCssBaseline`, always. MUI's reset comes
in two forms: `CssBaseline` writes it to `html`/`body`, `ScopedCssBaseline` writes the same
rules to a wrapping `div`. Only the second can be embedded — the first repaints the background,
colour and font of whatever page the console lands in, which for a docs site means restyling
the documentation around it. The standalone app keeps a global `CssBaseline` too, because an
app legitimately owns its page; the scoped one inside it applies the same rules over the same
palette, so it changes nothing there.

Note the two are _different theme slots_. `MuiCssBaseline` overrides are global by nature and
invisible to `MuiScopedCssBaseline`, which is why they stay in `app/src/theme.ts`. The
`--dx-chart-*` token mapping is the one that matters here: the `@dxscript` chart reads those
custom properties off the document root, so a host embedding `dxscript` into a page with no
global baseline needs its own equivalent. `market-data` no longer has that problem — its
candle chart is vanilla dxcharts-lite, which takes colours as config, so `candle-chart.tsx`
maps the MUI palette itself and needs nothing global.

**The theme is core's, and the font is not.** `createConsoleTheme(...overrides)` owns the
palette, shape and control density; `app/src/theme.ts` layers on what only a page can own —
Inter, the glass app bar, the global baseline overrides. `typography.fontFamily` is
`'inherit'`, deliberately: an embedded console picks up the host's type. Omitting it would not
achieve that, because `createTheme` fills in MUI's Roboto stack and the console would impose
Roboto on a page that asked for nothing.

The merge happens on the **options**, before `createTheme` runs. `createTheme(options, ...args)`
merges its extra arguments into the theme it already computed, which strips anything derived: a
`fontFamily` supplied that way lands on `typography.fontFamily` while `body1` and the headings
keep the stack they were built from. That shipped briefly as a console rendering in Roboto
inside a page rendering in Inter.

**The host owns light/dark.** `ConsolePage` takes an optional `theme`. A host with a
`ThemeProvider` already above the page — the app — passes nothing, so there is one theme in the
tree. A host embedding into a page that is not MUI's passes one, and gets a self-contained
console; that provider is given `colorSchemeNode={null}` and `storageManager={null}`.

Both are necessary. Left to itself, MUI's provider resolves the mode by reading `localStorage`
and then writes the resulting class onto `document.documentElement` — so an embedded console
read a mode it never stored and flipped the host page dark through the host's own `.dark`
rules, on a light OS. Nothing is lost by removing it: the theme selects color schemes by class,
which MUI expands to the descendant selector `.dark &`, and `next-themes` with
`attribute="class"` writes exactly `class="dark"` on `<html>`. The host's toggle drives the
console through CSS with no code in between, which is why an embedded console renders no mode
switch of its own — that control belongs to the app shell, and always did.

The residue: `useColorScheme()` then reports the provider's default rather than what is on
screen, so `useResolvedColorScheme()` is wrong in an embed. Two channel packages carry a copy
and read it — the dxScript editor's own light/dark prop, and the candle chart's colour config
— and neither is on the docs site's path, so this stays a channel-package problem rather than
a blocker.

> Sections 5 and 6 above are the design written before the rebuild and have drifted from the
> code in wording and in small details. §§1–3 were rewritten with the move to Effect and match
> the code; §2's "nothing global but the theme" holds for state — see §9 for where the theme
> is no longer necessarily global either. §4 describes the package layout as it now stands,
> and §§7–9 were written against it.
