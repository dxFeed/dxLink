# dxlink-docs → dxlink-debug-console — Parity Gap Analysis & Migration Plan

Status of the rebuild as of this analysis, and the concrete work left before
`@dxfeed/dxlink-docs` can be retired.

> Scope, decisions and the original phase breakdown live in [PLAN.md](./PLAN.md);
> the design lives in [ARCHITECTURE.md](./ARCHITECTURE.md). This document is a
> **parity audit of what actually shipped** plus the migration plan for the remainder.

---

## 1. Verdict

The rebuild covers the architecture, the shell, and the runtime plumbing well: connection,
auth, channel lifecycle, Feed, DOM, Candles and IndiChart all run against a real server
through ViewModels, and several areas (theme, error center, channel dialogs, multi-indicator
IndiChart, pause/clear/copy on the events grid) are ahead of the old console.

**Two features are entirely absent, and a set of smaller behaviours were dropped in the port.**

| | |
|---|---|
| Feature areas at parity or better | 8 of 11 |
| **Missing outright** | **Protocol/AsyncAPI page · dxScript editor** |
| Behavioural regressions to fix | 9 |
| Infra/packaging items outstanding | 6 |

`dxlink-docs` **cannot be retired yet** — the Protocol tab and the dxScript editing
experience have no equivalent in the new console.

---

## 2. Parity matrix

| Area | `dxlink-docs` | `dxlink-debug-console` | Status |
|---|---|---|---|
| App shell, nav, routing | `layout/layout.tsx`, HashRouter, light-only | `app/App.tsx`, HashRouter, system/light/dark | ✅ better |
| Connection | `debug-console/connection.tsx` | `features/connection/*` | ✅ better (adds Reconnect) |
| Authorization | `debug-console/authorization.tsx` | `features/auth/auth-panel.tsx` | ✅ better (tri-state gating) |
| Connection error list | `debug-console/errors.tsx` | `features/errors/error-center.tsx` | ✅ better (timestamps, clear) |
| **Channel-level errors** | `channel-widget.tsx` subscribes `addErrorListener` | *nothing* | ❌ **missing** |
| Channels manager | `channels-manager.tsx` | `features/channels/channels-area.tsx` | ✅ better (dialogs, per-kind forms) |
| Feed — configuration | `feed-channel-manager.tsx` | `features/feed/feed-configuration.tsx` | ✅ parity |
| Feed — subscriptions | `feed-subscriptions.tsx` | `features/feed/feed-subscriptions.tsx` | ⚠️ regressions (§3.4–3.6) |
| Feed — data tables | `feed-data.tsx` | `features/feed/feed-events-table.tsx` | ⚠️ regressions (§3.3, §3.7) |
| DOM | `dom-*.tsx` | `features/dom/*` | ✅ parity |
| Candles + chart | `candles/*`, `candles-*.tsx` | `features/feed/candles.ts`, `feed-chart-channel.tsx` | ✅ parity (and reachable again — §3.12) |
| IndiChart — data flow | `chart-wrapper.ts` (`ChartHolder`) | `features/indichart/indichart-view-model.ts` | ✅ parity (multi-indicator = better) |
| **IndiChart — script editor** | `@dxscript/dxlink-dxscript-editor` | plain `TextField` + samples dropdown | ❌ **missing** |
| IndiChart — parameters | `parameter-field.tsx` (643 lines) | `features/indichart/parameter-field.tsx` (209) | ⚠️ regressions (§3.1, §3.2) |
| IndiChart — script errors | 6 categories + stack trace | type + message + line/col | ⚠️ partial (§3.8) |
| IndiChart — live param apply | `updateIndicatorsParameters` | re-subscribes + resets chart | ⚠️ regression (§3.9) |
| **Protocol / AsyncAPI page** | `protocol/asyncapi.tsx` | `Placeholder` card | ❌ **missing** |

---

## 3. Gaps in detail

### P0 — blocks retiring `dxlink-docs`

#### 3.0 Protocol (AsyncAPI) page is a placeholder
`pages/protocol-page.tsx:28` renders a dashed `Placeholder`; the Download button has no
handler. The old page (`dxlink-docs/src/protocol/asyncapi.tsx`) renders the spec with
`@asyncapi/react-component/browser`, importing
`../../../../dxlink-specification/asyncapi.yml?url`, plus a download action.

`@asyncapi/react-component` is **not** in `package.json`. `vite.config.ts:11` already sets
`assetsInclude: ['**/*.yml', '**/*.yaml']`, so only the dependency, the import (recomputed
for this package's depth — one level shallower than docs) and the component are missing.

#### 3.0b No dxScript editor
`features/indichart/indichart-channel-request.tsx:74` edits indicator source in a bare
multiline `TextField`. The old console used `DxScriptEditor` from
`@dxscript/dxlink-dxscript-editor` with syntax highlighting, a built-in samples button, the
language logo and an `onError` channel for server errors. For a console whose main job is
authoring dxScript, plain-textarea editing is the single biggest UX regression.

PLAN.md §2 decided to replace this with CodeMirror 6 and accept the loss of first-party
tooling. That decision predates the "**fully** migrate old features" goal and should be
revisited — see §6, decision D1.

### P1 — behavioural regressions

#### 3.1 SESSION parameter editor lost its dialog
`dxlink-docs/src/debug-console/parameter-field.tsx:292-449` implements a full SESSION editor:
interval/raw mode toggle, `<input type="time">` start/end, 7 day toggles, a preset `<select>`
when `options` is constrained, read-only timezone, plus `parseSession`/`formatSession` for the
`HHMM-HHMM:days` wire format. The new `parameter-field.tsx:176-208` falls through to a plain
text field (or a select when `options` exist) — users must hand-type `0930-1600:12345`.

#### 3.2 COLOR named-color map dropped
Docs maps 26 dxScript color names (`RED`, `DODGER_BLUE`, …) to hex before feeding
`<input type="color">` (`parameter-field-container.tsx:10-62`). The new `toColor`
(`parameter-field.tsx:17-22`) passes the raw value through, so a server-sent named color
yields an invalid color-input value and a silent fallback.

#### 3.3 Feed event rows collide across order sources
Docs keys a row by `eventSymbol` **plus** `#source` when the event carries one
(`feed-channel-manager.tsx:113-114`). The new VM keys on `eventSymbol` alone
(`feed-view-model.ts:177-181`), so `Order` events for the same symbol from different sources
overwrite each other — one row where there should be several.

#### 3.4 Order-source picker replaced by free text
Docs offers the 34 predefined sources (`feed-order-source.ts`) in a dropdown behind a
checkbox. The new subscription form has a free-text "Order source" field
(`feed-subscriptions.tsx:127-135`).

#### 3.5 Event-type list is short by four
Docs exposes 18 types (`feed-event-type.ts`); `feed-subscriptions.tsx:26-41` hardcodes 14 —
missing **DailyCandle, TradeETH, Configuration, Message**.

#### 3.6 Documentation links dropped
Docs links to kb.dxfeed.com for event types and order sources, to currentmillis.com for
`fromTime`, and to the candle-symbols KB page on both candle forms. None survive.

#### 3.7 Data-grid columns no longer follow the protocol field order
Docs derives columns from the server-reported `config.eventFields`
(`feed-data.tsx:43-58`), so the table mirrors what the protocol negotiated. The new grid
derives columns from received-object keys and sorts them alphabetically
(`feed-events-table.tsx:29-39`) — for a protocol debug tool the negotiated order is the
signal.

#### 3.8 Script-error reporting is thinner
`chart-wrapper.ts:105-158` categorises SYNTAX / RUNTIME (with a rendered `scriptStack` trace)
/ TIMEOUT / LIMIT / CANCELLED / UNKNOWN and surfaces `internalErrorMessage`. The new
`indichart-channel.tsx:230-254` shows type, message and line:column only — no stack trace,
no friendly text for timeout/limit/cancelled.

#### 3.9 No live indicator-parameter apply
Docs applies parameter edits with `updateIndicatorsParameters({ current: values })` — no
re-subscribe, no chart reset (`script-candles-channel-manager.tsx:73-75`). The new `apply()`
always goes through `setSubscription` and resets the chart
(`indichart-view-model.ts:161-170`, `indichart-channel.tsx:338-348`), so tweaking one MA
period refetches all candles.

#### 3.10 IndiChart has no Reset
Docs has an explicit Reset that clears the channel and the chart
(`script-candles-channel-manager.tsx:77-83`). The new widget offers only Apply and a terminal
Close.

#### 3.11 Channel identity and parameters not shown
Docs titles each widget `Channel #<protocol id> <SERVICE> - <parameters>`
(`channel-widget.tsx:53,65-77`). The new widget shows a synthetic id and a static subtitle
(`channel-widget.tsx:59-81`) — the protocol channel id and negotiated parameters, both useful
when reading a protocol log, are not displayed.

#### 3.12 Channels are created without `logLevel: DEBUG`
Docs passes `DXLinkLogLevel.DEBUG` to every service (`index.tsx:150-206`). The new VMs pass
only `feed`/`space`. The client keeps DEBUG (`connection-view-model.ts:89`), so channel-level
protocol logging is quieter than before.

*(Note: docs' Candles channel was unreachable — `channels-manager.tsx:53` drops `onOpenCandles`
and renders no button. The new console exposes it as Feed → "Candle chart", which restores a
feature that was dead in the old app.)*

#### 3.13 Opening a channel without a client throws in render
`feed-channel.tsx:41-43`, `dom-channel.tsx:224-226` and `indichart-channel.tsx:270-272` throw
inside a `useState` initializer. Docs caught the equivalent failure and pushed an `UNKNOWN`
error into the error list (`index.tsx:144-158`). An uncaught throw here blanks the page.

### P2 — packaging, infra, polish

| # | Item |
|---|---|
| 3.14 | `index.html:8` references `/favicon.ico`; the package has no `public/` directory → 404. Copy `dxlink-docs/public/favicon.ico`. |
| 3.15 | No `README.md` (every sibling package has one). |
| 3.16 | `turbo.json` defines build/test/lint/publish but no `typecheck` task, so the package's `typecheck` script is not reachable via Turbo. |
| 3.17 | Test coverage is one file (`connection-url.test.ts`). PLAN.md §6 targets ViewModels, zod schemas, `SortedList`, candle-flag processing, session parsing, color map, event-field normalization. |
| 3.18 | No Playwright E2E and no mock `DXLinkWebSocketConnector` (PLAN.md phase 8 / risk 6). |
| 3.19 | No CI/CD or deploy config exists anywhere in the repo (no `.github/`), so "mirror the dxlink-docs pipeline" needs the pipeline's actual location identified first — it is not in-tree. |

---

## 4. Migration plan

Seven independently shippable steps. Each ends lint + typecheck + test + build green.

### M1 — Protocol (AsyncAPI) page  · P0
- Add `@asyncapi/react-component` (start at `2.5.0`, the version known to work in docs; try
  `3.1.0` and keep it only if the React 19 peer graph resolves cleanly).
- Port `protocol/asyncapi.tsx` into `pages/protocol-page.tsx`: import the standalone
  `@asyncapi/react-component/browser` bundle and `@asyncapi/react-component/styles/default.css`,
  `schema={{ url: schemaUrl }}`, `config.show.sidebar: false`.
- Spec import path from this package: `../../../dxlink-specification/asyncapi.yml?url`
  (one segment shallower than docs — verify the resolved asset URL in a production build, not
  just in dev).
- Wire the existing Download button to `window.open(schemaUrl, '_blank', 'noopener,noreferrer')`.
- Lazy-load the route (`React.lazy`) — the AsyncAPI bundle is large.
- The viewer's stylesheet is light-only: give it an explicit light surface (as docs does with
  `background-color: #fff`) so it stays readable in dark mode.
- **Done when:** `/protocol` renders the dxLink spec in both themes, download works, and the
  main bundle does not grow.

### M2 — dxScript editor  · P0
Resolve decision **D1** (§6) first.
- *Path A (recommended, true parity):* add `@dxscript/dxlink-dxscript-editor` at the snapshot
  matching the pinned `@dxscript/dxlink-dxcharts-lite@1.13.0-SNAPSHOT-2`; replace the
  `TextField` in `indichart-channel-request.tsx` with `DxScriptEditor`
  (`onChange`, `height`, `enableSamplesButton`, `showLangLogo`, `onError`); drop the local
  samples dropdown if the editor's own samples button covers it, otherwise keep both.
- *Path B (PLAN.md's original CodeMirror 6 route):* `@codemirror/*` + JS-baseline highlighting,
  keep the `@dxscript/js-samples` dropdown, decorate server `ScriptError` line/column. Cheaper
  to maintain, explicitly **not** parity.
- Either path: route the compiled `ScriptError` back into the editor so errors are shown at the
  offending line, not only in the Alert below.
- **Done when:** an indicator can be written with highlighting, a sample inserted, and a syntax
  error is visible at its line.

### M3 — IndiChart parameter fidelity  · P1
- Port the SESSION dialog (§3.1) into an MUI `Dialog`: mode toggle (`ToggleButtonGroup`),
  start/end `TextField type="time"`, day toggles, preset `Select` when `meta.options` is set,
  read-only timezone. Extract `parseSession`/`formatSession`/`normalizeSessionTime` into
  `shared/lib/session.ts` **with unit tests** — the `HHMM-HHMM:days` format is the part most
  likely to break silently.
- Port `COLOR_MAP` (26 names) into `shared/lib/colors.ts`; use it in `toColor` (§3.2), tests
  for name → hex, `#rrggbb` passthrough, `{ value }` object form, and the unknown-name fallback.
- Add live parameter apply (§3.9): an "Apply parameters" action calling
  `chart.updateIndicatorsParameters(...)` through a new VM command, separate from the
  subscription Apply.
- Add Reset (§3.10): clear the channel + `chartRef.reset()` without closing the widget.
- Expand script-error rendering (§3.8) to all six categories, rendering `scriptStack` frames
  for RUNTIME.
- **Done when:** every parameter type from PLAN.md §5 is editable with a type-appropriate
  control, parameters re-apply without a candle refetch, and each error category renders
  distinctly.

### M4 — Feed fidelity  · P1
- Restore the `#source` row key (§3.3) in `feed-view-model.ts` — unit-test that two `Order`
  events, same symbol, different sources, produce two rows.
- Restore the predefined order-source list (§3.4): port `feed-order-source.ts` to
  `shared/lib/order-sources.ts`, render as an `Autocomplete` with `freeSolo` so the 34 known
  sources are offered without blocking new ones.
- Complete the event-type list (§3.5): port `feed-event-type.ts` verbatim into
  `shared/lib/event-types.ts` and use it in both the subscription form and the event-fields
  editor.
- Order grid columns by the negotiated `config.eventFields` when available, falling back to the
  current derivation (§3.7).
- Restore the KB/currentmillis helper links (§3.6) on the feed subscription, candle
  subscription and IndiChart subscription forms.
- **Done when:** multi-source Order subscriptions render one row per source, all 18 event types
  are selectable, and columns follow the server's field order.

### M5 — Channel-level errors & robustness  · P1
- Add `errors: ChannelError[]` to each channel VM, wired from `channel.addErrorListener`, with
  a `clearErrors` command (`FeedViewModel`, `DomViewModel`, `IndiChartViewModel`).
- Surface them in `ChannelWidget` via an errors slot reusing `ErrorCenter` — connection errors
  stay on `ConnectionViewModel`, per ARCHITECTURE.md §2.
- Show the protocol channel id and negotiated parameters in the widget header (§3.11).
- Pass `logLevel: DXLinkLogLevel.DEBUG` when constructing every service (§3.12).
- Replace the throwing `useState` initializers with a rendered error state (§3.13).
- **Done when:** a deliberately invalid subscription surfaces its channel error in that
  channel's card and nowhere else, and no channel path can blank the page.

### M6 — Packaging & quality gates  · P2
- `public/favicon.ico` (§3.14) and `README.md` (§3.15).
- Add a `typecheck` task to `turbo.json` (§3.16).
- Unit tests per PLAN.md §6 (§3.17): VM store/commands/coalescing, `SortedList`, candle flag
  processing, session parsing, color map, event-field normalization, `#source` keying.
- Mock `DXLinkWebSocketConnector` via `connectorFactory` + Playwright smoke as a separate
  non-blocking job (§3.18).
- Bundle budget + code-splitting for `/protocol`, the chart and the editor.
- **Done when:** `pnpm build && pnpm test && pnpm lint && pnpm typecheck` are green from the
  workspace root and the bundle budget is enforced.

### M7 — Parity sign-off & `dxlink-docs` retirement
- Side-by-side walkthrough of every row in §2 against the dev WS endpoint; dark-mode and
  responsive QA.
- Confirm where `dxlink-docs` is deployed from (§3.19 — the pipeline is not in this repo) and
  repoint it at `dxlink-debug-console`.
- Then, in one change: remove `dxlink-docs` from `pnpm-workspace.yaml`, drop the root `docs`
  script from `package.json`, delete the package, and drop its now-unused entry from the
  changeset `ignore` list. This also removes `@dxfeed/ui-kit`, `styled-components`,
  `react-is`, `rehype-*`/`remark-*`/`unified` and the React 18 type packages from the lockfile.
- Update `.claude/launch.json` and the root `README.md` if they still point at docs.

---

## 5. Suggested order

M1 and M2 are independent and both P0 — run them in parallel if two people are available.
M3/M4/M5 are independent of each other. M6 folds naturally into whichever step touches a given
area (add each step's tests with that step, not at the end). M7 is last by definition.

```
M1 Protocol ──┐
M2 Editor ────┼── M3 Params ──┐
              │   M4 Feed ────┼── M6 Packaging ── M7 Retire docs
              └── M5 Errors ──┘
```

---

## 6. Decisions needed

**D1 — dxScript editor: first-party package or CodeMirror 6?**
PLAN.md chose CodeMirror and accepted losing completion/diagnostics. That trade conflicts with
a "full migration" goal. `@dxscript/dxlink-dxscript-editor` is first-party, already proven in
docs, and comes with the samples button for free — the arguments against it (proprietary, an
extra snapshot dependency) are the same arguments that apply to `@dxscript/dxlink-dxcharts-lite`,
which this package already depends on. **Recommendation: Path A.** Revisit only if the editor
has no React 19-compatible snapshot.

**D2 — Dev default WebSocket URL.**
Docs defaults to `ws://localhost:9959` in dev (`connection.tsx:84-87`); the new console
defaults to `wss://dxlink-md-ws-dev.dxkube.com` (`shared/lib/connection-url.ts:6`). The new
default is friendlier but points a dev build at a shared server by default. Confirm this is
intended, or restore localhost and surface the dev relay as a preset.

**D3 — DOM "Accept order fields".**
Both consoles ship it as a disabled "Not available" stub. Keep the stub, or implement it now
that `DepthOfMarketAcceptConfig` is being touched anyway?

**D4 — Deploy pipeline location.**
No CI config exists in this repository. M7 cannot complete until the team confirms where the
`dxlink-docs` build is deployed from.

---

## 7. Deliberately not migrated

These are improvements, not gaps — recorded so the parity review does not flag them:

- **Light-only theme** → replaced by system/light/dark.
- **`@dxfeed/ui-kit` + `styled-components`** → replaced by MUI; `ContentTemplate`, `Select`,
  `Dropdown`-based `FeedEventFieldsView` and the custom `icons.tsx` have stock MUI equivalents.
- **Per-type event-fields form** (one text input per known event type) → replaced by
  add/remove rows, which also supports types not in the built-in list.
- **Single-indicator IndiChart** → the new console supports up to `MAX_INDICATORS` (10).
- **Docs' unreachable Candles button** → the candle chart is reachable in the new console.
