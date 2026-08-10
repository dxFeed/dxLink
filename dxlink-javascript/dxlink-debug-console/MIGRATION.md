# dxlink-docs → dxlink-debug-console — Parity Status

Audit of the rebuild against `@dxfeed/dxlink-docs`, and what remains before that package
can be retired. Started as a gap analysis; now tracks what has been closed.

> Scope and the original phase breakdown are in [PLAN.md](./PLAN.md); the design is in
> [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## 1. Status

| | Then | Now |
|---|---|---|
| Feature areas at parity or better | 8 of 11 | **11 of 11** |
| Features missing outright | 2 | **0** |
| Behavioural regressions | 9 | **0** |
| Packaging / infra items | 6 | 3 |
| Tests | 7 | **78** |

Both missing features are implemented: the Protocol page renders the AsyncAPI
specification, and the dxScript editor is back. All nine behavioural regressions are
fixed.

**`dxlink-docs` is not yet retired.** What blocks it is no longer feature parity but
§4: a sign-off pass against a live server, and confirming where the deploy comes from.

---

## 2. Parity matrix

| Area | `dxlink-docs` | `dxlink-debug-console` | Status |
|---|---|---|---|
| App shell, nav, routing | `layout/layout.tsx`, light-only | `app/App.tsx`, system/light/dark | ✅ better |
| Connection | `debug-console/connection.tsx` | `features/connection/*` | ✅ better (adds Reconnect) |
| Authorization | `debug-console/authorization.tsx` | `features/auth/auth-panel.tsx` | ✅ better (tri-state gating) |
| Connection errors | `debug-console/errors.tsx` | `features/errors/error-center.tsx` | ✅ better (timestamps, clear) |
| Channel-level errors | `channel-widget.tsx` | per-channel VM → widget error center | ✅ fixed |
| Channels manager | `channels-manager.tsx` | `features/channels/channels-area.tsx` | ✅ better (per-kind dialogs) |
| Feed — configuration | `feed-channel-manager.tsx` | `features/feed/feed-configuration.tsx` | ✅ parity |
| Feed — subscriptions | `feed-subscriptions.tsx` | `features/feed/feed-subscriptions.tsx` | ✅ fixed |
| Feed — data tables | `feed-data.tsx` | `features/feed/feed-events-table.tsx` | ✅ fixed |
| DOM | `dom-*.tsx` | `features/dom/*` | ✅ parity |
| Candles + chart | `candles/*`, `candles-*.tsx` | `features/feed/candles.ts`, `feed-chart-channel.tsx` | ✅ parity |
| IndiChart — data flow | `chart-wrapper.ts` | `features/indichart/indichart-view-model.ts` | ✅ parity (multi-indicator = better) |
| IndiChart — script editor | `@dxscript/dxlink-dxscript-editor` | same package | ✅ fixed |
| IndiChart — parameters | `parameter-field.tsx` | `parameter-field.tsx` + `session-parameter-field.tsx` | ✅ fixed |
| IndiChart — script errors | 6 categories + stack | `script-error.ts`, same 6 + stack | ✅ fixed |
| IndiChart — live param apply | `updateIndicatorsParameters` | `applyParameters` command | ✅ fixed |
| Protocol / AsyncAPI page | `protocol/asyncapi.tsx` | `pages/protocol-page.tsx` | ✅ fixed |

---

## 3. What was closed

### Features

- **Protocol page.** Renders the spec via the `@asyncapi/react-component/browser`
  standalone bundle (the plain entry expects a pre-parsed document). The spec is imported
  with Vite's `?url`, so one asset serves both the viewer and the Download button. The
  route is lazy-loaded: the parser and highlighter compile to a 2.4 MB chunk that would
  otherwise sit in the 1.1 MB initial bundle. The AsyncAPI stylesheet is light-only, so
  the viewer subtree is pinned to a light surface — inheriting the app palette rendered
  dark text on dark.
  *Correction to the earlier draft of this document: the relative path to
  `dxlink-specification/asyncapi.yml` is **identical** to the one in dxlink-docs, not one
  segment shallower — `src/pages` sits at the same depth as that package's `src/protocol`.*

- **dxScript editor.** `DxScriptEditor` at `1.12.0-SNAPSHOT` — the version already in the
  lockfile, which declares `react >=18` and so accepts React 19. It is **uncontrolled**:
  it owns its text and reports through `onChange` with no prop to push text back in. So
  each editor mounts empty and its own samples button is the way in — which supersedes
  our samples dropdown, since the editor depends on `@dxscript/js-samples` itself. That
  direct dependency, its wrapper and its ambient declaration were removed as dead code.
  Because text cannot be restored, the IndiChart request resets whenever the dialog
  opens; Feed and DOM requests still persist between opens.

### Regressions

| # | Was | Now |
|---|---|---|
| 1 | SESSION parameters degraded to a plain text field | `session-parameter-field.tsx`: interval mode with time pickers and weekday toggles, raw mode, presets when `options` constrains them. Format logic in `shared/lib/session.ts`, round-trip tested |
| 2 | COLOR lost the dxScript palette, so `RED` silently became black | `shared/lib/colors.ts` resolves all 26 names, hex with or without alpha, and the `{ value }` wrapper |
| 3 | Feed rows keyed on `eventSymbol` alone, collapsing Order sources | `feedEventKey` appends `#source`, as dxlink-docs did |
| 4 | Free-text order source | Autocomplete over the 34 predefined sources, `freeSolo` so unlisted ones still work |
| 5 | 14 of 18 event types | All 18, restoring DailyCandle, TradeETH, Configuration, Message — also offered in the event-fields editor, which had no list at all |
| 6 | Documentation links dropped | kb.dxfeed.com event types and order sources, candle symbols, currentmillis.com — back on the feed, candle-chart and IndiChart forms |
| 7 | Grid columns sorted alphabetically | Ordered by the negotiated `FeedConfig.eventFields`; received-but-unnegotiated fields appended so nothing is hidden |
| 8 | Script errors showed type, message, line only | All six categories, RUNTIME stack frames, internal failures, and unrecognised types shown rather than swallowed |
| 9 | Parameters only applied by re-subscribing, refetching all candles | `Apply parameters` calls `updateIndicatorsParameters`; `Reset` clears without closing the channel |

Also closed alongside these:

- **Channel-level errors** — every channel VM listens on its channel and keeps its own
  `errors[]`, surfaced on that channel's card. Connection errors still aggregate on the
  connection VM.
- **Channel identity** — the widget shows the protocol channel id and the parameters the
  channel was actually opened with. Those replace the chips rendered from our own request
  config: same information, negotiated rather than requested. IndiChart deliberately does
  not show parameters — for that service they carry the whole indicator source.
- **Channel failures contained** — channel cards are wrapped in an error boundary. Three
  construct their VM in a `useState` initializer that throws without a live client, and
  they host a third-party chart; either could blank the console and take every other open
  channel with it. The throws remain (they are clear programmer errors) but can no longer
  take down the page.
- **`logLevel: DEBUG`** on Feed, DOM and Candles channels. **Not** IndiChart:
  `DXLinkIndiChart`'s constructor accepts no options at all, so its logger is fixed at
  `WARN`. Changing `dxlink-api` is out of scope (PLAN.md §1), so this is recorded rather
  than worked around.
- **Candle chart ignored feed/space** — `DXLinkCandles` never forwarded either to its
  HISTORY feed, so values entered in the request dialog were discarded. Now forwarded.
- **Test teardown** — with `globals: false`, Testing Library's auto-cleanup never
  registered, so components stayed mounted between tests and React kept scheduling work
  against a replaced DOM. `cleanup` now runs from the setup file.
- **Favicon** — `index.html` referenced `/favicon.ico` with no `public/` directory, so
  every page load 404ed.
- **README** and a **`typecheck` Turbo task** — the package had a `typecheck` script that
  Turbo could not reach.

---

## 4. What remains

| # | Item | Note |
|---|---|---|
| 1 | **`pnpm-lock.yaml` not updated** | Two dependencies were added (`@asyncapi/react-component`, `@dxscript/dxlink-dxscript-editor`) and one removed (`@dxscript/js-samples`). The lockfile was left alone deliberately: `@dxfeed/*` and `@dxscript/*` resolve from dxFeed's internal Artifactory, which the authoring environment could not reach, so a regenerated lockfile would have rewritten those entries to public URLs. **Run `pnpm install` to refresh it.** |
| 2 | **Runtime check of the editor and chart paths** | See §5. |
| 3 | Playwright E2E + mock `DXLinkWebSocketConnector` | PLAN.md phase 8 / risk 6. Unit coverage is now 78 tests, but there is no end-to-end pass. |
| 4 | CI/CD, deploy, bundle budget | No CI config exists anywhere in this repository, so "mirror the dxlink-docs pipeline" needs the pipeline's actual location identified first — it is not in-tree. |
| 5 | Parity sign-off against a live server | Walk §2 against the dev WS endpoint; dark-mode and responsive QA. |
| 6 | Retire `dxlink-docs` | Once 1–5 are done: repoint the deploy, then remove the package from `pnpm-workspace.yaml`, drop the root `docs` script, delete the directory, and drop its entry from the changeset `ignore` list. That also removes `@dxfeed/ui-kit`, `styled-components`, `react-is`, the `rehype-*`/`remark-*`/`unified` chain and the React 18 type packages from the lockfile. Update `.claude/launch.json` and the root `README.md` if they still point at docs. |

---

## 5. Verification status

Everything in §3 was written against a checked-out workspace where `pnpm install` cannot
complete: `@dxfeed/ui-kit` and all three `@dxscript/*` packages are published only to
dxFeed's internal registry. The checks were run against the public dependency set, with
the internal packages replaced by local stubs reproducing the surface the console uses.

**Verified:** `tsc --noEmit`, ESLint, 78 Vitest tests and a production Vite build all
pass. The Protocol page was additionally rendered in Chromium in light and dark mode, and
the built output confirmed to emit the spec asset and the separate lazy chunk.

**Not verified — needs one run with registry access:**

- the `DxScriptEditor` integration, against the package's real types and at runtime;
- the `IndiChart` chart surface in `feed-chart-channel.tsx` and `indichart-channel.tsx`
  (unchanged in behaviour, but it was stubbed here too);
- the editor version pin, which should be reviewed against whatever snapshot matches
  `@dxscript/dxlink-dxcharts-lite@1.13.x`.

---

## 6. Open decisions

**D1 — dxScript editor.** *Resolved: the first-party editor.* PLAN.md §2 had chosen
CodeMirror 6 and accepted losing dxScript completion and diagnostics; that trade-off was
reversed in favour of parity.

**D2 — dev default WebSocket URL.** Still open. dxlink-docs defaults to
`ws://localhost:9959` in development; this console defaults to
`wss://dxlink-md-ws-dev.dxkube.com` (`shared/lib/connection-url.ts`). Friendlier, but it
points a dev build at a shared server by default. Confirm, or restore localhost and offer
the relay as a preset.

**D3 — DOM "Accept order fields".** Still open. Both consoles ship it as a disabled
"Not available" stub.

**D4 — deploy pipeline location.** Still open; blocks §4 item 6.

---

## 7. Deliberately not migrated

Improvements, not gaps — recorded so a parity review does not flag them:

- **Light-only theme** → system/light/dark.
- **`@dxfeed/ui-kit` + `styled-components`** → MUI. `ContentTemplate`, `Select`, the
  `Dropdown`-based event-fields view and the custom `icons.tsx` all have stock equivalents.
- **Per-type event-fields form** (one input per known type) → add/remove rows with an
  event-type Autocomplete, which also accepts types not on the list.
- **Single-indicator IndiChart** → up to `MAX_INDICATORS` (10).
- **Samples dropdown** → the editor's own samples button, which is where dxlink-docs got
  them from too.
- **dxlink-docs' unreachable Candles button** (`channels-manager.tsx` dropped
  `onOpenCandles` and rendered no button) → the candle chart is reachable here, as a Feed
  channel view.
