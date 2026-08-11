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
- owns the underlying dxlink-api instance **as a private field** (kept *off* the store),
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
const useVM = (vm, selector) => useStore(vm.store, selector)   // wraps useStore
const connection = useVM(connectionVM, s => s.connection)      // re-renders only on this slice
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
- Connection params persisted to localStorage. **Tab-nav lifecycle (resolved): page-scoped** —
  navigating `/`→`/protocol` unmounts the page and closes the socket (exact current behavior),
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
their feature**; only cross-cutting code lives in `shared/`.

```
dxlink-debug-console/
  ARCHITECTURE.md · CLAUDE.md · index.html · vite.config.ts · package.json · tsconfig.json
  src/
    main.tsx                     # createRoot + <App/>
    app/                         # bootstrap & shell ONLY
      App.tsx                    # providers (Theme, Router) + layout chrome (AppBar/Tabs) + <Outlet/>
      theme.ts                   # MUI colorSchemes (light + dark, system default)
      routes.tsx                 # route path → page
    pages/                       # route-level compositions (thin; assemble features)
      console-page.tsx           # creates page-scoped ConnectionViewModel + <VMProvider>; renders connection/auth/channels
      protocol-page.tsx          # renders the AsyncAPI viewer (no VM)
    features/                    # feature slices: VM + views + schema, CO-LOCATED
      connection/
        connection-view-model.ts # owns DXLinkWebSocketClient + connection/auth/errors + channels[]
        connection-context.tsx   # VMProvider / useConnectionVM (consumed within the page subtree)
        connection-panel.tsx · connection-form.tsx · schema.ts
      auth/        auth-panel.tsx
      errors/      error-center.tsx
      channels/
        channel-view-model.ts    # ChannelViewModel base/interface
        channel-registry.ts      # kind → feature descriptor; how connection opens channels
        channels-area.tsx · channel-widget.tsx
      feed/        feed-view-model.ts (+exports channel descriptor) · feed-config-form.tsx · feed-subscription-form.tsx · feed-events-table.tsx · schema.ts
      dom/         dom-view-model.ts (+descriptor) · dom-open-form.tsx · dom-ladder.tsx
      candles/     candles-view-model.ts (+descriptor) · candles-subscription-form.tsx · candles-chart.tsx   # ports DXLinkCandles + SortedList
      indichart/   indichart-view-model.ts (+descriptor) · script-editor.tsx · parameter-form.tsx · indichart-chart.tsx · script-errors.tsx   # ports ChartHolder
    shared/                      # cross-cutting ONLY
      view-model.ts              # ViewModel base + useVM(vm, selector) hook
      components/                # genuine gaps only: JsonView, CodeMirrorEditor
      lib/                       # order-sources, event-types, formatters, color-map, session-parse, coalesce
      hooks/
  e2e/                           # Playwright specs   (unit tests colocated as *.test.ts)
```

Channel-feature dependency direction (acyclic): `connection → channels → {feed, dom, candles, indichart} → shared`.
Each channel feature exports a descriptor `{ kind, service, create(client, params) }`; `channel-registry.ts`
aggregates them so `ConnectionViewModel` opens channels without hard-importing each feature. Adding a channel
kind = new feature folder + register its descriptor.

## 5. Schema-driven indicator parameter form
The IndiChart in/out parameters (`DOUBLE | STRING | BOOL | COLOR | SOURCE | SESSION | ENUM`)
become a single dynamic renderer driven by parameter metadata → a zod schema built at
runtime → react-hook-form. SESSION keeps its dedicated dialog (interval/raw modes, day
selection, timezone). COLOR keeps the dxScript color-name ⇄ hex mapping.

## 6. UI/UX design

### 6.1 Stock-MUI mapping (what we use instead of custom UI)
| Current custom piece | Stock MUI replacement |
|---|---|
| `ContentTemplate` / `Paper` panels | `Card` + `CardHeader` + `CardContent` |
| `TextField` wrapper, `Select` wrapper | `TextField`, `Select` / `Autocomplete` |
| Connection status dot | `Chip` (color by state) |
| Errors dropdown | `Alert` / `Snackbar` + `Menu`/`Popover` |
| Buttons / icon buttons | `Button`, `IconButton` + `Tooltip` |
| Channel widget shell | `Card` + `Accordion` (collapsible) + `Tabs` |
| Dialogs (e.g. SESSION editor) | `Dialog` |
| Feed/DOM tables | `@mui/x-data-grid` (`DataGrid`) |
| Forms layout | `Grid` / `Stack` |
| Genuine gaps → keep custom | JSON view; CodeMirror editor wrapper |

### 6.2 UX improvements (over current console)
- Theme follows the OS by default (`prefers-color-scheme`); in-app control to switch System / Light / Dark, persisted to localStorage (current app is light-only).
- Persisted connection presets and last-used params; shareable URL state for tab + URL.
- Connection status as a clear badge; explicit reconnect control.
- Live feed tables: virtualized, **pause/resume** + **clear**, copy-row-as-JSON, throttled.
- Collapsible/reorderable channel panels.
- Error center: timestamped, grouped by source (connection vs channel), dismissible.
- Full keyboard accessibility and responsive layout (MUI a11y baseline).
