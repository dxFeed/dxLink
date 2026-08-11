# Handoff — the internal-registry tasks, and how they went

These six tasks were open only because the authoring environment could not reach dxFeed's
internal registries. They have since been run on a machine that can. This is the record:
what was done, what it changed, and the one thing still genuinely blocked — repointing the
deploy, which needs a pipeline that does not exist in this repository.

Current status of the package is in [MIGRATION.md](./MIGRATION.md); how to re-run the
validation is in [CLAUDE.md](./CLAUDE.md); scope in [PLAN.md](./PLAN.md); design in
[ARCHITECTURE.md](./ARCHITECTURE.md).

| #   | Task                           | Outcome                                                   |
| --- | ------------------------------ | --------------------------------------------------------- |
| 1   | Regenerate the lockfile        | ✅ Done — but only after task 6                           |
| 2   | Verify the dxScript editor     | ✅ Done — and it overturned three design choices          |
| 3   | Verify the chart paths         | ✅ Done — on the dxScript server, not the market-data one |
| 4   | Add the indicator-removal test | ✅ Done — and confirmed to fail on the regression         |
| 5   | Live-server parity sign-off    | ✅ Done — all nine regressions; three new defects fixed   |
| 6   | D2/D3/D4 decisions             | 🟡 D4 forced and now urgent; D2 and D3 still open         |

---

## 1. Regenerate the lockfile — done, via a detour

The straightforward path failed. `pnpm install` never reached resolution: the
supply-chain gate verifies the **existing lockfile** first, and rejected three entries —
the only three that referenced `dxfeed.jfrog.io`.

| Package                          | Problem                                                                                                                            | Fixable?             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `@dxfeed/dxlink-core@0.9.0`      | Tarball URL pointed at jFrog; the package is published on public npmjs, which is what `.npmrc` now selects for the `@dxfeed` scope | Yes, by re-resolving |
| `@dxfeed/dxlink-indichart@0.9.0` | Same                                                                                                                               | Yes, by re-resolving |
| `@dxfeed/ui-kit@2.15.2`          | **404 on npmjs, on nexus, and on every jFrog repo tried**, with a valid token. Existed only in the local pnpm store                | No                   |

ui-kit was used by `dxlink-docs` alone. Since a fresh resolution was the only way forward
and no fresh resolution could ever produce that entry, task 6's retirement was brought
forward and the package deleted. `pnpm clean --lockfile && pnpm install` then completed
and passed the policy gate.

Worth recording: **this was not a branch problem.** Any clone of this repository, on any
branch including `main`, hit the same wall. Removing `dxlink-docs` from
`pnpm-workspace.yaml` alone does not work around it — the gate reads the lockfile before
the workspace, so the stale entry is still there to fail on.

Two corrections to guidance this document originally carried:

- `@dxscript/*` entries carry **no `tarball:` field**, only `integrity:` — pnpm omits it
  when the resolution matches the scope's configured registry. Expecting them to name
  jFrog was wrong.
- The two `@dxfeed/*` tarballs **had to** move off jFrog. "Verify all three still point at
  jFrog" would have blocked the correct fix.

`@scarf/scarf` — analytics reached through `@asyncapi/react-component` → `@stoplight/spectral-*`
— surfaced as a new build-script decision and was denied, not allowed.

---

## 2. Verify the dxScript editor — done, and it changed the design

Everything checked out: the editor mounts, highlights dxScript, shows the language logo,
and its "Try examples" picker opens the full bundled sample list with docs links.

**The important finding.** This branch had made three choices to accommodate an assumption
that the editor was uncontrolled. Read against the real package, the assumption was wrong,
and all three are now resolved:

| Assumed                | Actual                                                                                                 | Consequence                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| No way to push text in | `script?: string`, with `useEffect(() => { if (script !== undefined) setValue(script) }, [script])`    | Editors are now controlled: `script={entry.code \|\| undefined}`               |
| Mounts empty           | With `enableSamplesButton`, seeds from the first bundled sample and reports it via `onChange` on mount | `undefined` rather than `''` is passed, so a fresh card still gets that sample |
| Light-only             | `colorScheme?: 'light' \| 'dark'`                                                                      | Wired to the resolved MUI scheme; the editor was rendering light-on-dark       |

The samples dropdown stays dropped — the editor's own picker is richer than what it
replaced, so that one was never really a compromise.

The `colorScheme` fix needed a new `shared/lib/color-scheme.ts`. `useTheme().palette.mode`
cannot answer "what is on screen" in this app: the theme is built with `cssVariables` +
`colorSchemes`, so the palette is emitted once as CSS custom properties and `palette.mode`
stays at its default. `useColorScheme()` is the reactive source, and `'system'` has to be
resolved through `systemMode`.

**Version alignment.** There is **no `1.13.0-SNAPSHOT-2` editor** — that suffix exists only
for dxcharts-lite, so the current chart pin has no editor counterpart and keeping the
editor at `1.12.0-SNAPSHOT` is a defensible pairing. Date-stamped 1.13.0 snapshots do exist
for **both** packages on the same days (`1.13.0-SNAPSHOT-20260618-083905`, `-084328`,
`-101247`); to align them properly, move both pins to one of those pairs together. Both
packages have since moved to a `2.0.0-SNAPSHOT-*` line, so the 1.x line is trailing.

---

## 3. Verify the chart paths — done, on the other server

This was reported blocked. The cause was the endpoint, not the code:
`wss://dxlink-md-ws-dev.dxkube.com` answers an INDICHART channel request with
`BAD_ACTION — Unsupported service: 'INDICHART'`. **INDICHART is served by
`wss://dxlink-dxs-ws-dev.dxkube.com`.** Against that server everything works — the script
compiles, candles and indicator splines render, and all three controls behave.

The rejection on the market-data relay was not wasted: it surfaced as a **channel-level**
error on that channel's own card while the rest of the console stayed usable, which is one
of the behaviours this branch restored.

One defect fell out of this. Indicator states are reported once, when the scripts compile,
and are **not** repeated for a re-subscribe — so `apply()` clearing `outputs` left the
panel reading "0 outputs", Outputs section gone, while the chart drew those very series.
The clear is removed; outputs are scoped to the script, not the subscription.

The checks, all now confirmed:

| Control              | Expected                                                                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apply**            | Re-subscribes; candles reload, chart resets, panels go `pending` → `compiled`                                                                                                                                                     |
| **Apply parameters** | Recomputes indicators **without** refetching candles — the chart must not reset. Regression #9                                                                                                                                    |
| **Reset**            | Drops the subscription, clears the chart, leaves the channel usable. **The channel id changes** — the VM closes and reopens, since the protocol cannot cancel an INDICHART subscription short of replacing it. Correct, not a bug |

Known non-blocker: on `dxlink-dxcharts-lite@1.13.0-SNAPSHOT-2`, `showLabels` works but
skips the initial paint — labels appear after the first zoom or pan.

---

## 4. The indicator-removal test — done

Added [indichart-channel-request.test.tsx](src/features/indichart/indichart-channel-request.test.tsx).
Two tests; suite is now 88.

The assertion had to change shape. Ace draws through a virtual renderer driven by real
layout measurements, which jsdom does not provide — `.ace_content` is empty there, so the
editors cannot be told apart by the text they display. They are distinguished by DOM node
identity instead: tag the mounted editors, remove the middle card, and check which nodes
survived.

**It was verified to fail on the regression.** Reintroducing `key={index}` produces
`expected [ 'a', 'b' ] to deeply equal [ 'a', 'c' ]` — and the state-level assertion still
passes, confirming that only the identity half catches it.

One nuance discovered while writing it: now that `script` is passed, a reused editor
instance gets corrected by the prop, so the controlled fix already neutralises the common
case. It cannot correct an entry whose code is empty — `script` is then `undefined` and the
effect is skipped — which is what the id key still protects. The test comment says so.

Running the real editor under Vitest needed one config change: it imports its ace modes
without a file extension (`ace-builds/src-noconflict/mode-javascript`), which Vite's
bundler resolution handles and Vitest's Node resolution does not. The package is inlined
via `test.server.deps.inline`. Its published sourcemaps reference missing sources, so test
runs now emit sourcemap warnings — noise from the dependency, not a failure.

---

## 5. Live-server parity — done

All nine regressions walked against live servers. The step-by-step version lives in
[CLAUDE.md](./CLAUDE.md) so it can be repeated.

| #   | Check                           | Result                                                                                                       |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | SESSION parameter field         | Interval/Raw modes, time pickers, weekday toggles, read-only indicator timezone, result preview              |
| 2   | COLOR palette                   | `color.RED` renders a red swatch and `#FF0000` — not black                                                   |
| 3   | Order rows keyed with `#source` | `Order#DEX:AAPL` and `Order#ntv:AAPL` produce **two** rows                                                   |
| 4   | `freeSolo` order sources        | A source typed off the list is accepted and subscribed                                                       |
| 5   | All 18 event types              | Combobox lists exactly 18, including DailyCandle, TradeETH, Configuration, Message                           |
| 6   | Documentation links             | Present on the feed, candle-chart and IndiChart forms                                                        |
| 7   | Negotiated column order         | `eventSymbol, eventType, eventTime, sequence, timeNanoPart, bid*, ask*` — no alphabetical sort produces that |
| 8   | Script-error categories         | Title, message, `In script '1' at line N, column N`, and stack frames                                        |
| 9   | `Apply parameters`              | Recomputes with no candle reload; chart is not reset                                                         |

Also: FEED streams live, request text survives a dialog close/reopen and reaches the
channel's `Source` panel verbatim, and both light and dark render correctly.

Two defects came out of it, both fixed: the error summary line contradicted the alert
beneath it (a failing `onTick` was labelled "compilation error" while the alert said
"Runtime error"), and at 375px the app bar measured 587px, scrolling the page sideways and
pushing the theme switcher off screen. The third is in task 3.

Not exercised: the candle-chart surface in `feed-chart-channel.tsx`, and DOM beyond
opening a channel.

---

## 6. Decisions

**D2 — dev default WebSocket URL.** Still open, and now better informed. `dxlink-docs`
defaulted to `ws://localhost:9959`; this console defaults to
`wss://dxlink-md-ws-dev.dxkube.com` ([connection-url.ts:6](src/shared/lib/connection-url.ts:6)).
Two facts for the decision: that endpoint does **not** serve INDICHART (the dxScript server
does), and the console holds a single connection for the whole page, so Feed and IndiChart
cannot be open at once — switching means retyping the URL and reconnecting. Presets, or
per-service connections, would both address that. Deliberately left alone for now.

**D3 — DOM "Accept order fields".** Still open. Shipped as a disabled "Not available" stub.

**D4 — deploy pipeline location.** **Now urgent.** Retiring `dxlink-docs` was forced by
task 1, and the deploy was not repointed — that could not be done from here, since no CI or
deploy configuration exists anywhere in this repository. Whoever owns the deployment needs
to point it at `dxlink-debug-console`'s build output.
