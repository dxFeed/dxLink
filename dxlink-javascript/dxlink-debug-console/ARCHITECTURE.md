# dxlink-debug-console — Architecture

Design for the `@dxfeed/dxlink-debug-console` rebuild. For how to validate a change see
[CLAUDE.md](./CLAUDE.md); for what is still open see [README.md](./README.md).

The app follows **MVVM**. There is **no global store** — only ViewModels, each owning a
local Zustand vanilla store.

```
VIEW         MUI + React components — declarative, dumb
   │  binds slice ▲          calls command ▼
VIEWMODEL    plain TS class — UI state (Zustand vanilla store) + commands; no JSX
   │  wraps ▲                 calls ▼
MODEL        @dxfeed/dxlink-api — DXLinkWebSocketClient, DXLinkFeed, … (listener API)
```

## 1. ViewModels

Every dxlink-api entity is wrapped in a **ViewModel** — a plain class that:

- owns the underlying dxlink-api instance **as a private field** (kept _off_ the store),
- registers the model's `add*Listener` wiring **once** and maps it into store state,
- holds UI state in a **per-VM Zustand vanilla store** (`createStore`),
- exposes typed **commands** (`connect`, `configure`, `addSubscription`, `setAuthToken`, …),
- **coalesces** high-frequency updates (throttle/rAF) before `set`,
- has `dispose()` to remove listeners + close the model.

ViewModels:

- **`ConnectionViewModel`** (page-scoped) — owns the `DXLinkWebSocketClient`; state:
  `connection · auth · details · channels[] · errors[]`; commands: `connect / disconnect /
reconnect / setAuthToken / openFeed / openDom / openCandles / openScript / closeChannel`.
- **`FeedViewModel` / `DomViewModel` / `CandlesViewModel` / `IndiChartViewModel`** — one per
  open channel; `CandlesViewModel` ports the `DXLinkCandles` flag/snapshot logic + `SortedList`,
  `IndiChartViewModel` ports the `chart-wrapper.ts` `ChartHolder` logic.

Views bind through a single helper — no `useEffect` listener plumbing, no 260-line god component:

```ts
const useVM = (vm, selector) => useStore(vm.store, selector) // wraps useStore
const connection = useVM(connectionVM, (s) => s.connection) // re-renders only on this slice
```

## 2. Ownership, lifecycle & scope (nothing global but the theme)

```
main.tsx
└── <ThemeProvider>                         ← GLOBAL (theme spans all routes) ✅
    └── <HashRouter>                        ← hash routing + Vite base:'' (sub-path/static hosting)
        ├── "/"  <ConsolePage>
        │     │  new ConnectionViewModel()    ← created & owned here (PAGE-SCOPED)
        │     └── <VMProvider value={connectionVM}>   ← context scoped to this page only
        │           ├── <ConnectionPanel>   useVM(vm, s => s.connection)
        │           ├── <AuthPanel>         useVM(vm, s => s.auth)
        │           └── <ChannelsArea>      useVM(vm, s => s.channels)
        │                 └── <ChannelWidget vm={feedVM}>   useVM(feedVM, …)
        └── "/protocol" <AsyncApiViewer>      ← independent, no VM
```

- `ConnectionViewModel` lives for the Console page's mount lifetime; `dispose()` on unmount
  closes the socket. The page provides it to its subtree via a small context (avoids
  prop-drilling) — it is **not** mounted at the app root.
- **StrictMode-safe construction/disposal (important):** never `new VM()` in render. Lazy-init
  once — `const [vm] = useState(() => new ConnectionViewModel())` (or a `useRef` guard) — and
  `dispose()` in a `useEffect` cleanup; make `dispose()` **idempotent** so React 19's
  mount→unmount→remount double-invoke can't leak a second client. Same rule for channel VMs.
- **Channel identity:** each channel VM gets a **synthetic client-side id at construction** for
  React keys and `closeChannel(id)`. Do **not** key on `DXLinkChannel.id` — for IndiChart it is
  `undefined` until a subscription is set. Channel VMs live in `ConnectionViewModel.channels[]`;
  `openFeed()` constructs one (via the channel registry), `closeChannel(id)` calls its `dispose()`.
- **Error scoping:** connection-level errors aggregate on `ConnectionViewModel.errors[]`;
  **channel-level errors stay on their channel VM** (surfaced in the `ChannelWidget`), as today.
- **Connection params are not persisted** — the theme is the only thing that survives a
  reload. They come instead from the configuration profile (§7), which a host supplies and
  the forms start from. **Tab-nav lifecycle (resolved): page-scoped** — navigating
  `/`→`/protocol` unmounts the page and closes the socket (exact current behavior),
  reconnect on return. An overlay/persist variant is a possible future UX change, not in scope.

## 3. Reactive data flow (one VM — same shape for all)

```
            ┌──────────────── dxlink-api entity (e.g. DXLinkFeed) ────────────────┐
            │  add*Listener(...)  ◀── wired ONCE inside the VM                     │
            └─────────────────────────────────────────────────────────────────────┘
                       │  events / state-change / config-change / errors
                       ▼
        ┌──────────────────────── FeedViewModel ──────────────────────────┐
        │  • maps model events → store.setState (immutable)                │
        │  • COALESCES high-frequency events (rAF / throttle ~10–20fps)    │
        │  • createStore() (Zustand vanilla) — local to this VM            │
        │  commands: configure(), addSubscription(), removeSubscription()… │
        └───────▲───────────────────────────────────────────┬─────────────┘
                │ useVM(vm, selector) → useStore(vm.store, …) │ vm.command()
                │ (re-renders only on the selected slice)     │
        ┌───────┴─────────────────────────────────────────────▼─────────────┐
        │  MUI views: <FeedEventsTable> (DataGrid),                          │
        │             <FeedConfigForm> / <FeedSubscriptionForm> (RHF + zod)  │
        └─────────────────────────────────────────────────────────────────────┘
```

The live dxlink objects stay as private VM fields; only UI state goes in the store.

## 4. Directory layout

Layered, feature-sliced: **`app → pages → features → shared`** (dependencies point downward;
features never import pages, pages never import other pages). ViewModels are **co-located with
their feature**; only cross-cutting code lives in `shared/`. Unit tests sit beside what they
test as `*.test.ts(x)` and are elided below.

```
dxlink-debug-console/
  ARCHITECTURE.md · README.md · CLAUDE.md · index.html · vite.config.ts · package.json · tsconfig.json
  src/
    main.tsx                     # resolves the profile + channel list, then createRoot + <App/>
    app/                         # bootstrap & shell ONLY
      App.tsx                    # providers (Theme, Router) + layout chrome (AppBar/nav) + <Routes/>
      theme.ts                   # MUI colorSchemes (light + dark, system default)
      routes.tsx                 # createRoutes(config, channels) — route path → page
      console-config.ts          # resolveAppConsoleConfig() — the only reader of globals (§7)
      channels.ts                # createAppChannels() — the only module naming all four services (§8)
    pages/                       # route-level compositions (thin; assemble features)
      console-page.tsx           # creates page-scoped ConnectionViewModel + provider; connection/auth/channels
      protocol-page.tsx          # renders the AsyncAPI viewer (no VM)
    features/                    # feature slices: VM + views + types, CO-LOCATED
      connection/
        connection-view-model.ts # owns DXLinkWebSocketClient + connection/auth/errors state
        connection-context.tsx   # provider / useConnectionVM — also the channel-plugin host API (§8)
        connection-panel.tsx
      auth/        auth-panel.tsx
      errors/      error-center.tsx
      channels/
        plugin.ts                # ChannelPlugin contract + defineChannelPlugin (§8)
        types.ts                 # DraftChannel — { id, kind, config: unknown }
        channels-area.tsx        # registry-driven: add-buttons, request dialog, open channels
        channel-widget.tsx       # the collapsible card every channel body sits in
      feed/        plugin.tsx · types.ts · feed-view-model.ts · feed-candles-view-model.ts · feed-channel.tsx · feed-channel-request.tsx · feed-chart-channel.tsx · feed-configuration.tsx · feed-subscriptions.tsx · feed-events-table.tsx · candles.ts · sorted-list.ts
      dom/         plugin.tsx · types.ts · dom-view-model.ts · dom-channel.tsx · dom-channel-request.tsx
      indichart/   plugin.tsx · types.ts · indichart-view-model.ts · indichart-channel.tsx · indichart-channel-request.tsx · parameter-field.tsx · session-parameter-field.tsx · script-error.ts
      rpc/         plugin.tsx · types.ts · rpc-view-model.ts · rpc-channel.tsx · rpc-channel-request.tsx · descriptors.ts   # binds protobuf descriptors via @dxfeed/dxlink-protobuf-es
    shared/                      # cross-cutting ONLY
      view-model.ts              # ViewModel + useVM(vm, selector) + useOwnedViewModel + createViewModelContext
      components/                # doc-link · dxfeed-logo · error-boundary · theme-mode-toggle
      lib/                       # console-config(+context) · channel-kinds · connection-url · channel-errors · timestamped-error · order-sources · event-types · colors · color-scheme · session
    test/setup.ts                # jest-dom, Testing Library cleanup, jsdom gaps
```

Channel-feature dependency direction (acyclic): `connection → channels → {feed, dom, indichart,
rpc} → shared`, with one edge added on top — `app/channels.ts` imports each service's plugin,
because composition is the app's job.

**Each channel feature exports a descriptor**, as this design always intended: `plugin.tsx`
declares a `ChannelPlugin` and `app/channels.ts` aggregates them, so `ChannelsArea` renders
channels without hard-importing any feature. Adding a channel kind = new feature folder +
register its plugin. The one departure from the original sketch is the layer: the descriptor
registers *UI* per service (add-button, request form, channel body) rather than teaching
`ConnectionViewModel` how to open channels, because each channel view model already opens its
own channel off the client it is handed. §8 has the contract.

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

Everything a deployment can decide about a console before anyone opens it lives in one
`ConsoleConfig` (`shared/lib/console-config.ts`): the WebSocket URL, the keepalive timings,
the descriptor-set URL, which channel services are on offer, and which of those values the
user may not change.

**It seeds initial state; it does not own state.** Each value is read once, into the local
draft state of the form that owns it, and is never written back — the user stays free to
edit. The one exception is `locked`, which is how a host says a field is fixed rather than
merely suggested; a locked field renders read-only rather than hidden, because in a debug
console the endpoint you are talking to is worth seeing even when you cannot change it.

Four sources, later winning:

```
built-in defaults  ←  app defaults  ←  window.__DXLINK_CONFIG__  ←  location.search
   (derived from        (the dev          (what a gateway            (?ws= &
    the location)        relay)            substituted into           descriptors= &
                                           index.html)                channels=)
```

Two rules make locking mean something: **only the injected config can lock** (a query
parameter is written by whoever opened the link, so letting it pin — or unpin — a field
would make locking a lie), and **a locked field ignores its query parameter**.

`app/console-config.ts` is the only place that reads globals, and the only place that reads
`import.meta.env`. Everything below takes the resolved profile as data: `ConsolePage` accepts
it as a prop and provides it through `ConsoleConfigProvider`, so an embedding host with its
own answers passes them in and the page reaches for nothing.

## 8. Channel registry

The descriptor §4 describes, in full. `ChannelsArea` knows nothing about FEED, DOM,
INDICHART or RPC; each service is a `ChannelPlugin` (`features/channels/plugin.ts`) carrying
everything the area used to hardcode as a four-way switch:

| | |
| --- | --- |
| `kind`, `label`, `icon` | the add-button, the channel title, the error-boundary name |
| `dialogTitle`, `dialogMaxWidth` | the request dialog |
| `createRequest()` | the value the request form starts from, seeded once per plugin |
| `RequestForm` | the form itself, `{ value, onChange }` |
| `canOpen?(request)` | whether "Open channel" is enabled |
| `buildConfig(request)` | request → channel config, or `null` when it cannot be opened |
| `Channel` | the opened channel, `{ title, config }` |

Plugins reach the connection exactly as the channel components always have —
`useConnectionVM()` for the view model, `useVM` to read its state. Those two are the whole
host API; there is no plugin-specific context.

`DraftChannel.config` is `unknown`. It was produced by the plugin named by `kind` and is only
ever handed back to that same plugin, so no config type — and no config *dependency* — needs
to reach this feature. That is what keeps `@bufbuild/protobuf`, dxcharts and the dxScript
editor out of `features/channels/`. The types are checked inside each plugin, by
`defineChannelPlugin`, which is also the single place the erasure happens.

`ConsolePage` and `ChannelsArea` take the plugin list as a **required** prop, never a default:
which services exist is a composition decision (`app/channels.ts`), not something a component
should assume. A console that should not offer market data leaves those plugins out and never
imports their code — the difference between filtering a button and not shipping a dependency.

Two filters, doing different jobs: the registered plugins say which services exist in this
build, and the profile's `channelKinds` (§7) says which of those this deployment offers. The
second filters add-buttons only — an already-open channel keeps rendering, so a profile that
disagrees with what is on screen degrades instead of crashing.

> Sections 1–3, 5 and 6 above are the design written before the rebuild and have drifted from
> the code in wording and in small details. §4 has been brought back in line with the tree,
> and §§7–8 were written against it.
