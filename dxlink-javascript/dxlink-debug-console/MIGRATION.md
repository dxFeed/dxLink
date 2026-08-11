# dxlink-docs → dxlink-debug-console — Parity Status

Audit of the rebuild against `@dxfeed/dxlink-docs`, and what remains before that package
can be retired. Started as a gap analysis; now tracks what has been closed.

> The design is in [ARCHITECTURE.md](./ARCHITECTURE.md); how to re-run the verification in
> [CLAUDE.md](./CLAUDE.md).

---

## 1. Status

| | Then | Now |
|---|---|---|
| Feature areas at parity or better | 8 of 11 | **11 of 11** |
| Features missing outright | 2 | **0** |
| Behavioural regressions | 9 | **0** |
| Packaging / infra items | 6 | 2 |
| Live sign-off | — | **complete** |
| Tests | 7 | **88** |

Both missing features are implemented: the Protocol page renders the AsyncAPI
specification, and the dxScript editor is back. All nine behavioural regressions are
fixed.

**`dxlink-docs` has been retired** — the package is deleted and the workspace installs
without it. Live sign-off is complete against both dev servers. What remains in §4 is the
deploy repoint, now urgent because of the retirement, and an automated end-to-end pass.

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
  otherwise sit in the initial bundle, which is 2.1 MB in its own right once the real
  editor and chart packages are included. The AsyncAPI stylesheet is light-only, so
  the viewer subtree is pinned to a light surface — inheriting the app palette rendered
  dark text on dark.
  *Correction to the earlier draft of this document: the relative path to
  `dxlink-specification/asyncapi.yml` is **identical** to the one in dxlink-docs, not one
  segment shallower — `src/pages` sits at the same depth as that package's `src/protocol`.*

- **dxScript editor.** `DxScriptEditor` at `1.12.0-SNAPSHOT` — the version already in the
  lockfile, which declares `react >=18` and so accepts React 19. It is **controlled**
  through a `script` prop that it pushes back into its buffer, and it takes a
  `colorScheme` of its own; both are wired up. Its bundled samples button supersedes our
  samples dropdown, since the editor depends on `@dxscript/js-samples` itself — that
  direct dependency, its wrapper and its ambient declaration were removed as dead code.
  Requests persist between dialog opens for all three services.
  *Correction to the earlier draft of this document: this section previously described the
  editor as uncontrolled, mounting empty and unable to be re-populated, and three choices
  were made to accommodate that. It was written against a local stub. The real package
  behaves otherwise — see §5.*

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
  connection VM. The shared mechanics live in `shared/lib/channel-errors.ts`
  (`ChannelErrorTracker`), so the four channel VMs cannot drift apart; lists are capped at
  `MAX_ERRORS` per scope, since a server rejecting a large batch can emit thousands.
- **Channel identity** — the widget shows the protocol channel id and the parameters the
  channel was actually opened with. Those replace the chips rendered from our own request
  config: same information, negotiated rather than requested. IndiChart deliberately does
  not show parameters — for that service they carry the whole indicator source.
- **Channel failures contained**, by two separate mechanisms, because they fail in two
  different places:
  - *Render* — channel cards are wrapped in an error boundary, as is the lazy Protocol
    route. Three channels construct their VM in a `useState` initializer that throws
    without a live client; that throw remains (it is a clear programmer error) but can no
    longer blank the console and take every other open channel with it.
  - *Protocol dispatch* — `chartRef.pushData` is called synchronously from the WebSocket
    frame handler, which does not guard its listeners. A throw there is invisible to React
    (it is not a render error) and would abort that frame for every other channel, so both
    chart views catch it and surface it as a chart error.
- **`logLevel: DEBUG`** on Feed, DOM and Candles channels. **Not** IndiChart:
  `DXLinkIndiChart`'s constructor accepts no options at all, so its logger is fixed at
  `WARN`. Changing `dxlink-api` was out of scope for the rebuild, so this is recorded rather
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
- **A code-review pass over all of the above**, in two commits: correctness fixes, then
  deduplicating the channel-error state and dropping a surface that had become dead. Test
  count went from 78 to 86.

---

## 4. What remains

| # | Item | Note |
|---|---|---|
| 1 | ~~`pnpm-lock.yaml` not updated~~ | **Done.** Regenerated from a fresh resolution. This could not be done incrementally: the supply-chain gate rejected the pre-existing lockfile outright, because `@dxfeed/ui-kit@2.15.2` is no longer published to any reachable registry and two `@dxfeed/*` tarballs still pointed at jFrog for packages now served from npmjs. Retiring `dxlink-docs` (item 6) removed the ui-kit dependency and unblocked it. The lockfile lost ~1100 lines with docs' React 18 tree, and now contains no `dxfeed.jfrog.io` references at all. `@scarf/scarf` — analytics pulled in through `@asyncapi/react-component` — was added to `ignoredBuiltDependencies` rather than allowed to run its install script. One side effect: dev dependencies moved within their existing ranges, and Prettier `3.8.3 → 3.9.6` reformats union types, so six pre-existing files across five other packages were reformatted to keep `pnpm lint` green. That part of the diff is formatting only. |
| 2 | ~~Runtime check of the editor and chart paths~~ | **Done.** INDICHART is served by `wss://dxlink-dxs-ws-dev.dxkube.com`, not the market-data relay. See §5 and [CLAUDE.md](./CLAUDE.md). |
| 3 | Playwright E2E + mock `DXLinkWebSocketConnector` | Unit coverage is 88 tests and the manual pass in [CLAUDE.md](./CLAUDE.md) is complete, but nothing is automated end to end. |
| 4 | CI/CD, deploy, bundle budget | No CI config exists anywhere in this repository, so "mirror the dxlink-docs pipeline" needs the pipeline's actual location identified first — it is not in-tree. **This is now urgent rather than deferred:** `dxlink-docs` has been deleted, so whatever serves the deployed console must be repointed. |
| 5 | ~~Parity sign-off against a live server~~ | **Done.** All nine regressions walked against live servers, plus light/dark and 375px. Three defects found and fixed — see §5. |
| 6 | ~~Retire `dxlink-docs`~~ | **Done**, ahead of the original ordering, because item 1 could not complete while the package was in the workspace. Removed from `pnpm-workspace.yaml`, the root `docs` script, and the changeset `ignore` list; the directory (45 tracked files) is deleted, and `README.md`/`AGENTS.md` no longer point at it. `.claude/launch.json` already referenced only the debug console. That also removed `@dxfeed/ui-kit`, `styled-components`, `react-is`, the `rehype-*`/`remark-*`/`unified` chain and the React 18 type packages from the lockfile. **The deploy was not repointed — see item 4.** |

---

## 5. Verification status

The stubs are gone. The workspace now installs for real — see §4 item 1 — so everything
below was checked against the actual `@dxscript/*` packages.

**Verified against the real dependencies:** `tsc --noEmit`, ESLint, 88 Vitest tests and a
production Vite build all pass. The Protocol page renders in Chromium in light and dark
mode, and the built output emits the spec asset and the separate lazy chunk.

**Verified at runtime.** All nine regressions above, the editor, the chart's
`Apply` / `Apply parameters` / `Reset` paths, channel-level error routing, light and dark,
and 375px width. Services live on different servers — FEED/DOM on
`wss://dxlink-md-ws-dev.dxkube.com`, INDICHART on `wss://dxlink-dxs-ws-dev.dxkube.com`.
**[CLAUDE.md](./CLAUDE.md) is the procedure**: which server serves what, what each check
proves, and how to repeat it.

**What the editor actually does**, having been stubbed when §3 was first written:

| Assumed | Actual |
|---|---|
| Uncontrolled; no way to push text in | Takes `script`, and a `useEffect` on it sets the buffer |
| Mounts empty | With `enableSamplesButton`, seeds from the first bundled sample and reports it through `onChange` on mount |
| Light-only | Takes `colorScheme: 'light' \| 'dark'` |

Three choices had been made to accommodate the assumption; all three are resolved. The
editor is now passed `script={entry.code || undefined}` (`undefined` rather than `''` so a
fresh card still gets the editor's own sample), the IndiChart request no longer resets on
every dialog open, and `colorScheme` is driven from the resolved MUI scheme through
`shared/lib/color-scheme.ts` — `useTheme().palette.mode` cannot answer that question here,
because the app builds its theme with `cssVariables` + `colorSchemes`. The samples dropdown
stays dropped: the editor's own picker is richer than what it replaced.

**Three defects that only a live server could surface**, all fixed here:

| Found | Cause |
|---|---|
| After `Apply`, the panel read "0 outputs" and the Outputs section vanished, while the chart went on drawing those series | `apply()` cleared `outputs`. Indicator states are reported once at compile and **not** repeated for a re-subscribe, so nothing refilled it. Outputs are scoped to the script, not the subscription |
| A failing `onTick` was summarised as "compilation error" directly above an alert titled "Runtime error" | `indicatorSummary` hardcoded one label for every disabled indicator instead of using the category `describeScriptError` already derives |
| At 375px the app bar measured 587px, scrolling the page sideways and pushing the theme switcher off screen | The toolbar was one fixed row; the `noWrap` wordmark could not yield. It now collapses to the logo below `sm` |

**Still not exercised:** the candle-chart surface in `feed-chart-channel.tsx` (the IndiChart
surface in `indichart-channel.tsx` is covered), and the DOM service beyond opening a channel.

---

## 6. Open decisions

**D1 — dxScript editor.** *Resolved: the first-party editor.* The rebuild plan had chosen
CodeMirror 6 and accepted losing dxScript completion and diagnostics; that trade-off was
reversed in favour of parity.

**D2 — dev default WebSocket URL.** Still open. dxlink-docs defaults to
`ws://localhost:9959` in development; this console defaults to
`wss://dxlink-md-ws-dev.dxkube.com` (`shared/lib/connection-url.ts`). Friendlier, but it
points a dev build at a shared server by default. Confirm, or restore localhost and offer
the relay as a preset.

**D3 — DOM "Accept order fields".** Still open. Both consoles ship it as a disabled
"Not available" stub.

**D4 — deploy pipeline location.** Still open, and now the most pressing of the four:
§4 item 6 went ahead without it, so `dxlink-docs` no longer exists to serve. Whoever owns
the deployment needs to point it at `dxlink-debug-console`'s build output.

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
