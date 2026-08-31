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

## 4. Package layout

The console is an **umbrella of four packages**. Three are libraries a host composes; the
fourth is the app that composes them for us and is the first consumer of the same contract
any other host would use.

```
dxlink-javascript/dxlink-console/
  ARCHITECTURE.md · README.md · CLAUDE.md · tsconfig.base.json

  core/        @dxfeed/dxlink-console-core        no market-data anything
    src/index.ts                 # the public surface: page, plugin contract, host API, profile
    console-page.tsx             # page-scoped ConnectionViewModel + providers; connection/auth/channels
    view-model.ts                # ViewModel + useVM + useOwnedViewModel + createViewModelContext
    channels/
      plugin.ts                  # ChannelPlugin contract + defineChannelPlugin (§8)
      types.ts                   # DraftChannel — { id, kind, config: unknown }
      channels-area.tsx          # registry-driven: add-buttons, request dialog, open channels
      channel-widget.tsx         # the collapsible card every channel body sits in
    connection/                  # connection-view-model · connection-context · connection-panel
    auth/ · errors/
    components/                  # error-boundary
    lib/                         # console-config(+context) · channel-errors · timestamped-error

  market-data/ @dxfeed/dxlink-console-market-data   dxcharts-lite · dxScript editor · x-data-grid
    src/index.ts                 # all three plugins; subpaths below expose them one at a time
    feed/       plugin.tsx · types.ts · feed-view-model · feed-candles-view-model · feed-channel
                · feed-channel-request · feed-chart-channel · feed-configuration
                · feed-subscriptions · feed-events-table · candles · sorted-list · event-types
    dom/        plugin.tsx · types.ts · dom-view-model · dom-channel · dom-channel-request
    indichart/  plugin.tsx · types.ts · indichart-view-model · indichart-channel
                · indichart-channel-request · parameter-field · session-parameter-field
                · script-error · colors · color-scheme · session
    lib/        order-sources.ts  # the one piece of market-data vocabulary core must not hold
    components/ doc-link.tsx     # only ever used in market-data helper text

  rpc/         @dxfeed/dxlink-console-rpc          @bufbuild/protobuf · dxlink-protobuf-es
    src/       index.ts · plugin.tsx · types.ts · rpc-view-model · rpc-channel
               · rpc-channel-request · descriptors.ts

  app/         @dxfeed/dxlink-debug-console        the app; composes all of the above
    index.html · vite.config.ts
    src/       main.tsx · App.tsx · routes.tsx · theme.ts · channels.ts · protocol-page.tsx
               · console-config.ts        # resolves the profile + the RPC descriptor settings
               · console-config-sources.ts # parses window.__DXLINK_CONFIG__ and location.search
               · connection-url.ts        # derives / chooses the WebSocket URL
               · components/{dxfeed-logo,theme-mode-toggle}
```

Every package is `private: true` and none is published. Because the only consumer is our own
Vite app, they need no build step: each `main` points at `src/index.ts`, Vite resolves the
workspace source directly, and HMR works across package boundaries. Publishing means adding
tsup builds, `exports` maps and peer-dependency declarations — a separate decision.

Dependency direction (acyclic, and enforced by the package boundary rather than by
convention): `app → {market-data, rpc} → core`. Nothing points back up. Unit tests sit beside
what they test as `*.test.ts(x)`; each library package carries its own `vitest.config.ts` and
`src/test/setup.ts`.

**Each channel package exports a descriptor**, as this design always intended: `plugin.tsx`
declares a `ChannelPlugin` and `app/src/channels.ts` aggregates them, so `ChannelsArea`
renders channels without importing any of them. Adding a channel kind = a plugin + a line at
the composition site. The one departure from the original sketch is the layer: the descriptor
registers *UI* per service (add-button, request form, channel body) rather than teaching
`ConnectionViewModel` how to open channels, because each channel view model already opens its
own channel off the client it is handed. §8 has the contract.

**Core receives; it never reaches.** It reads no globals, no `import.meta.env`, no
`localStorage`; it holds no hostname, and it names no channel service. Everything about how a
console is deployed — which endpoint, which services, what a link may override, what a gateway
pinned — arrives as props. What that cost: `connection-url.ts` and the two source parsers live
in app, `doc-link.tsx` lives with the only code that uses it, and `ConsolePage` takes both
`config` and `channels` as **required** props rather than guessing either. §7 has the profile.

What the split buys, concretely: **core and rpc install no `@dxscript`, no dxcharts and no
data grid.** A host that wants an RPC-only console depends on those two packages and never
sees the market-data dependency tree — the difference between filtering a button and not
shipping a dependency. Within market-data, the `/feed`, `/dom` and `/indichart` subpaths keep
the same granularity for the bundle: registering only FEED should not pull the dxScript editor
that only INDICHART uses.

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

Note the two are *different theme slots*. `MuiCssBaseline` overrides — the `--dx-chart-*`
token mapping dxcharts-lite needs — are global by nature and invisible to
`MuiScopedCssBaseline`, which is why they stay in `app/src/theme.ts`. A host embedding
market-data into a page with no global baseline needs its own equivalent.

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
screen, so `useResolvedColorScheme()` (`market-data/src/indichart/color-scheme.ts`, for the
dxScript editor's own light/dark prop) is wrong in an embed. Market-data is not on the docs
site's path — it needs core and rpc — so this is a market-data problem, not a blocker.

> Sections 1–3, 5 and 6 above are the design written before the rebuild and have drifted from
> the code in wording and in small details. §2's "nothing global but the theme" is one such
> place — see §9, where the theme is no longer necessarily global. §4 describes the package
> layout as it now stands, and §§7–9 were written against it.
